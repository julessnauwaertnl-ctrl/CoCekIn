import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApp, client, signup } from './helpers.js';

const app = await startApp();
after(() => app.close());

test('health + security headers + SPA fallback', async () => {
  const c = client(app.base);
  const h = await c.get('/health');
  assert.equal(h.status, 200);
  const home = await c.get('/');
  assert.equal(home.status, 200);
  assert.match(home.headers.get('content-security-policy') ?? '', /default-src 'self'/);
  assert.equal(home.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(home.headers.get('x-frame-options') ?? home.headers.get('content-security-policy')?.includes("frame-ancestors 'none'"), true);
  const deep = await c.get('/clans/some-clan');
  assert.equal(deep.status, 200);
  const unknown = await c.get('/definitely-not-a-page');
  assert.equal(unknown.status, 404);
  const missingAsset = await c.get('/assets/nope.png');
  assert.equal(missingAsset.status, 404);
  const api404 = await c.get('/api/nope');
  assert.equal(api404.status, 404);
  assert.equal(api404.json.error.code, 'not_found');
});

test('register validates input and rejects duplicates', async () => {
  const c = client(app.base);
  const bad = await c.post('/api/auth/register', { email: 'nope', handle: 'a', displayName: '', password: 'short' });
  assert.equal(bad.status, 422);
  assert.ok(bad.json.error.fields.email && bad.json.error.fields.handle && bad.json.error.fields.displayName && bad.json.error.fields.password);

  const ok = await c.post('/api/auth/register', { email: 'Dup@Example.com', handle: 'Dupper', displayName: 'Dup', password: 'correct-horse-battery' });
  assert.equal(ok.status, 201);
  assert.equal(ok.json.user.handle, 'dupper');
  assert.equal(ok.json.user.email, 'dup@example.com');
  assert.match(ok.setCookie[0], /HttpOnly/);
  assert.match(ok.setCookie[0], /SameSite=Lax/);

  const dupEmail = await client(app.base).post('/api/auth/register', { email: 'dup@example.com', handle: 'other', displayName: 'Xy', password: 'correct-horse-battery' });
  assert.equal(dupEmail.status, 409);
  const dupHandle = await client(app.base).post('/api/auth/register', { email: 'new@example.com', handle: 'DUPPER', displayName: 'Xy', password: 'correct-horse-battery' });
  assert.equal(dupHandle.status, 409);
  const reserved = await client(app.base).post('/api/auth/register', { email: 'adm@example.com', handle: 'admin', displayName: 'Xy', password: 'correct-horse-battery' });
  assert.equal(reserved.status, 409);
});

test('login, session, logout', async () => {
  const { c, handle } = await signup(app.base);
  const me = await c.get('/api/me');
  assert.equal(me.json.user.handle, handle);
  const anon = await client(app.base).get('/api/me');
  assert.equal(anon.status, 200);
  assert.equal(anon.json.user, null);

  const wrong = await client(app.base).post('/api/auth/login', { email: `${handle}@example.com`, password: 'wrong-password-123' });
  assert.equal(wrong.status, 401);
  const unknown = await client(app.base).post('/api/auth/login', { email: 'ghost@example.com', password: 'wrong-password-123' });
  assert.equal(unknown.status, 401);
  assert.equal(wrong.json.error.message, unknown.json.error.message, 'must not reveal whether the account exists');

  const c2 = client(app.base);
  const login = await c2.post('/api/auth/login', { email: `${handle}@example.com`, password: 'correct-horse-battery' });
  assert.equal(login.status, 200);
  assert.equal((await c2.get('/api/me')).json.user.handle, handle);
  await c2.post('/api/auth/logout', {});
  assert.equal((await c2.get('/api/me')).json.user, null);
});

test('protected routes require authentication', async () => {
  const c = client(app.base);
  for (const [m, p] of [['PATCH', '/api/me'], ['POST', '/api/clans'], ['GET', '/api/me/requests'], ['POST', '/api/clans/x/join'], ['DELETE', '/api/me'], ['POST', '/api/me/sync']]) {
    const r = await c.raw(m, p, {});
    assert.equal(r.status, 401, `${m} ${p}`);
  }
});

test('CSRF protections: cross-origin and non-JSON writes are rejected', async () => {
  const { c } = await signup(app.base);
  const cross = await c.raw('PATCH', '/api/me', { bio: 'hijack' }, { Origin: 'https://evil.example' });
  assert.equal(cross.status, 403);
  const site = await c.raw('PATCH', '/api/me', { bio: 'hijack' }, { 'Sec-Fetch-Site': 'cross-site' });
  assert.equal(site.status, 403);
  const form = await c.raw('POST', '/api/auth/logout', 'a=b', { 'Content-Type': 'application/x-www-form-urlencoded' });
  assert.equal(form.status, 415);
  const sameOrigin = await c.raw('PATCH', '/api/me', { bio: 'fine' }, { Origin: app.base });
  assert.equal(sameOrigin.status, 200);
});

test('malformed and oversized bodies are handled', async () => {
  const { c } = await signup(app.base);
  const bad = await c.raw('PATCH', '/api/me', '{not json');
  assert.equal(bad.status, 400);
  const big = await c.raw('PATCH', '/api/me', JSON.stringify({ bio: 'x'.repeat(40_000) }));
  assert.equal(big.status, 413);
});

test('password change invalidates other sessions; wrong current password is rejected', async () => {
  const { c, handle } = await signup(app.base);
  const other = client(app.base);
  await other.post('/api/auth/login', { email: `${handle}@example.com`, password: 'correct-horse-battery' });
  assert.ok((await other.get('/api/me')).json.user);
  const wrong = await c.post('/api/me/password', { currentPassword: 'nope-nope-nope', newPassword: 'another-long-password' });
  assert.equal(wrong.status, 422);
  const ok = await c.post('/api/me/password', { currentPassword: 'correct-horse-battery', newPassword: 'another-long-password' });
  assert.equal(ok.status, 200);
  assert.equal((await other.get('/api/me')).json.user, null, 'other session must be revoked');
  assert.ok((await c.get('/api/me')).json.user, 'current session stays signed in');
  const relogin = await client(app.base).post('/api/auth/login', { email: `${handle}@example.com`, password: 'another-long-password' });
  assert.equal(relogin.status, 200);
});

test('login is rate limited', async () => {
  const limited = await startApp({ limits: { login: { max: 3, windowMs: 60_000 }, register: { max: 100, windowMs: 60_000 }, write: { max: 1000, windowMs: 60_000 }, read: { max: 1000, windowMs: 60_000 } } });
  try {
    const c = client(limited.base);
    const codes = [];
    for (let i = 0; i < 5; i++) codes.push((await c.post('/api/auth/login', { email: 'a@b.co', password: 'whatever-whatever' })).status);
    assert.deepEqual(codes, [401, 401, 401, 429, 429]);
  } finally { limited.close(); }
});

test('account deletion requires password and removes the account', async () => {
  const { c, handle } = await signup(app.base);
  assert.equal((await c.del('/api/me', { password: 'wrong' })).status, 422);
  assert.equal((await c.del('/api/me', { password: 'correct-horse-battery' })).status, 200);
  assert.equal((await client(app.base).get(`/api/players/${handle}`)).status, 404);
});

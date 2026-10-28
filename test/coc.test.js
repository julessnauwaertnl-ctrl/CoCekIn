import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startApp, signup, client } from './helpers.js';

test('without an API key, verification is clearly unavailable and stats stay self-reported', async () => {
  const app = await startApp();
  try {
    assert.equal((await client(app.base).get('/api/meta')).json.cocApi, false);
    const { c } = await signup(app.base);
    const v = await c.post('/api/me/verify', { playerTag: '#2PP0LRQ', apiToken: 'abc' });
    assert.equal(v.status, 503);
    assert.equal(v.json.error.code, 'coc_not_configured');
    assert.equal((await c.post('/api/me/sync', {})).status, 503);
  } finally { app.close(); }
});

test('verify + sync against a mocked official API; stats lock; tag change resets trust', async () => {
  /** @type {{url:string, method:string, auth:string|null, body:any}[]} */
  const calls = [];
  const fakeFetch = /** @type {typeof fetch} */ (async (url, init) => {
    const u = String(url);
    calls.push({ url: u, method: init?.method ?? 'GET', auth: new Headers(init?.headers).get('authorization'), body: init?.body ? JSON.parse(String(init.body)) : null });
    if (u.endsWith('/verifytoken')) {
      const ok = JSON.parse(String(init?.body)).token === 'good-token';
      return new Response(JSON.stringify({ tag: '#2PP0LRQ', token: 'x', status: ok ? 'ok' : 'invalid' }), { status: 200 });
    }
    if (u.includes('%23NOPE')) return new Response('{}', { status: 404 });
    return new Response(JSON.stringify({ name: 'Real Chief', townHallLevel: 17, trophies: 5100, bestTrophies: 5600, warStars: 1200, donations: 4000 }), { status: 200 });
  });
  const app = await startApp({ cocToken: 'server-secret' }, { fetchImpl: fakeFetch });
  try {
    assert.equal((await client(app.base).get('/api/meta')).json.cocApi, true);
    const a = await signup(app.base);
    assert.equal((await a.c.post('/api/me/verify', { playerTag: 'not a tag', apiToken: 'good-token' })).status, 422);
    const wrong = await a.c.post('/api/me/verify', { playerTag: '#2PP0LRQ', apiToken: 'bad-token' });
    assert.equal(wrong.status, 422);
    assert.ok(wrong.json.error.fields.apiToken);
    assert.equal((await a.c.get('/api/me')).json.user.verified, false);
    assert.equal((await a.c.post('/api/me/sync', {})).status, 403, 'cannot sync before verifying');

    const ok = await a.c.post('/api/me/verify', { playerTag: '#2pp0lrq', apiToken: 'good-token' });
    assert.equal(ok.status, 200);
    assert.equal(ok.json.user.verified, true);
    assert.equal(ok.json.user.statsSource, 'api');
    assert.equal(ok.json.user.thLevel, 17);
    assert.equal(ok.json.user.trophies, 5100);
    assert.equal(ok.json.achievements.find((/** @type {any} */ x) => x.id === 'verified').earned, true);
    assert.ok(calls.every((x) => x.auth === 'Bearer server-secret'), 'server key is used, player token is only sent in the body');
    assert.ok(calls.some((x) => x.url.includes('%232PP0LRQ')), 'tag is URL-encoded');
    assert.equal(JSON.stringify(ok.json).includes('good-token'), false);

    // stats are locked while verified
    const edit = await a.c.patch('/api/me', { trophies: 9999 });
    assert.equal(edit.status, 409);
    assert.equal(edit.json.error.code, 'stats_locked');
    assert.equal((await a.c.patch('/api/me', { bio: 'Still editable.' })).status, 200);
    assert.equal((await a.c.post('/api/me/sync', {})).status, 200);

    // another account cannot claim the verified tag
    const b = await signup(app.base);
    assert.equal((await b.c.post('/api/me/verify', { playerTag: '#2PP0LRQ', apiToken: 'good-token' })).status, 409);
    assert.equal((await b.c.patch('/api/me', { playerTag: '#2PP0LRQ' })).status, 200, 'unverified claims are allowed but never trusted');
    assert.equal((await b.c.get('/api/me')).json.user.verified, false);

    // changing the tag drops verification
    const changed = await a.c.patch('/api/me', { playerTag: '#8Q0Y2' });
    assert.equal(changed.json.user.verified, false);
    assert.equal(changed.json.user.statsSource, 'self');
  } finally { app.close(); }
});

test('upstream API failures are mapped to friendly errors', async () => {
  const codes = [404, 429, 403, 500];
  const expected = [404, 429, 502, 502];
  let i = 0;
  const fakeFetch = /** @type {typeof fetch} */ (async () => new Response('{}', { status: codes[i++ % codes.length] }));
  const app = await startApp({ cocToken: 't' }, { fetchImpl: fakeFetch });
  try {
    const { c } = await signup(app.base);
    for (let k = 0; k < codes.length; k++) {
      const r = await c.post('/api/me/verify', { playerTag: '#2PP0LRQ', apiToken: 'tok' });
      assert.equal(r.status, expected[k], `upstream ${codes[k]}`);
      assert.ok(r.json.error.message.length > 10);
    }
  } finally { app.close(); }
});

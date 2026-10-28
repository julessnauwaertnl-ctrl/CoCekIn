import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApp, client, signup, clanBody } from './helpers.js';

const app = await startApp();
after(() => app.close());

test('profile editing: validation, persistence, privacy', async () => {
  const { c, handle } = await signup(app.base);
  const bad = await c.patch('/api/me', { thLevel: 99, trophies: -1, avatar: '<script>', cover: 'nope', playerTag: 'zzz!', favoriteTroop: 'Dragon Slayer' });
  assert.equal(bad.status, 422);
  for (const f of ['thLevel', 'trophies', 'avatar', 'cover', 'playerTag', 'favoriteTroop']) assert.ok(bad.json.error.fields[f], f);

  const inconsistent = await c.patch('/api/me', { trophies: 3000, bestTrophies: 2000 });
  assert.equal(inconsistent.status, 422);

  const ok = await c.patch('/api/me', { displayName: 'Chief Wolf', bio: 'Pushing legends.', thLevel: 16, trophies: 5200, bestTrophies: 5400, warStars: 612,
    favoriteTroop: 'Electro Dragon', playerTag: '#2pp0lrq', avatar: 'sword-ruby', cover: 'lava-fields', lookingForClan: true });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.user.playerTag, '#2PP0LRQ');
  assert.equal(ok.json.user.rank.key, 'legend');
  assert.equal(ok.json.user.verified, false);
  assert.equal(ok.json.user.statsSource, 'self');

  const anon = client(app.base);
  const pub = await anon.get(`/api/players/${handle}`);
  assert.equal(pub.status, 200);
  assert.equal(pub.json.user.displayName, 'Chief Wolf');
  assert.equal('email' in pub.json.user, false, 'public profile must not leak email');
  assert.equal(JSON.stringify(pub.json).includes('password'), false);
  assert.equal(pub.json.achievements.find((/** @type {any} */ a) => a.id === 'trophy5k').earned, true);
  assert.equal(pub.json.achievements.find((/** @type {any} */ a) => a.id === 'th14').earned, true);
  assert.equal(pub.json.achievements.find((/** @type {any} */ a) => a.id === 'thmax').earned, false);
  assert.equal(pub.json.achievements.find((/** @type {any} */ a) => a.id === 'chieftain').earned, false);
});

test('players directory: filters, sorting, pagination', async () => {
  const a = await signup(app.base, { profile: { thLevel: 17, trophies: 6000, lookingForClan: true } });
  const b = await signup(app.base, { profile: { thLevel: 9, trophies: 2000 } });
  await signup(app.base);
  const anon = client(app.base);
  const top = await anon.get('/api/players?sort=trophies&pageSize=2');
  assert.equal(top.json.items.length, 2);
  assert.ok(top.json.items[0].trophies >= top.json.items[1].trophies);
  assert.ok(top.json.total >= 3 && top.json.pages >= 2);
  const lfc = await anon.get('/api/players?lfc=1');
  assert.ok(lfc.json.items.every((/** @type {any} */ p) => p.lookingForClan));
  assert.ok(lfc.json.items.some((/** @type {any} */ p) => p.handle === a.handle));
  const th = await anon.get('/api/players?thMin=9&thMax=10');
  assert.ok(th.json.items.every((/** @type {any} */ p) => p.thLevel >= 9 && p.thLevel <= 10));
  assert.ok(th.json.items.some((/** @type {any} */ p) => p.handle === b.handle));
  const q = await anon.get(`/api/players?q=${a.handle}`);
  assert.ok(q.json.items.some((/** @type {any} */ p) => p.handle === a.handle));
  const wildcard = await anon.get('/api/players?q=%25');
  assert.equal(wildcard.json.items.length, 0, 'LIKE wildcards must be escaped');
  assert.equal((await anon.get("/api/players?q=' OR 1=1 --")).status, 200);
});

test('clan lifecycle, discovery and eligibility', async () => {
  const leader = await signup(app.base, { profile: { thLevel: 12, trophies: 3000 } });
  const bad = await leader.c.post('/api/clans', { ...clanBody(), name: 'x', minTh: 40, emblem: 'nope' });
  assert.equal(bad.status, 422);
  assert.ok(bad.json.error.fields.name && bad.json.error.fields.minTh && bad.json.error.fields.emblem);

  const created = await leader.c.post('/api/clans', clanBody({ name: 'Iron Wolves', minTh: 10, tag: '#2yg9rq' }));
  assert.equal(created.status, 201);
  const slug = created.json.clan.slug;
  assert.equal(slug, 'iron-wolves');
  assert.equal(created.json.clan.tag, '#2YG9RQ');
  assert.equal(created.json.clan.stats.members, 1);
  assert.equal(created.json.clan.leader.handle, leader.handle);

  assert.equal((await leader.c.post('/api/clans', clanBody({ name: 'Another' }))).status, 409, 'already in a clan');
  const other = await signup(app.base, { profile: { thLevel: 14, trophies: 4000 } });
  const dup = await other.c.post('/api/clans', clanBody({ name: 'iron wolves' }));
  assert.equal(dup.status, 409);
  assert.ok(dup.json.error.fields.name);
  const reserved = await other.c.post('/api/clans', clanBody({ name: 'New' }));
  assert.equal(reserved.status, 201);
  assert.equal(reserved.json.clan.slug, 'new-clan', 'slug must never collide with /clans/new');
  await other.c.del('/api/clans/new-clan', { confirmName: 'New' });

  // discovery
  const anon = client(app.base);
  const list = await anon.get('/api/clans?q=wolves&type=open&war=always&focus=war&language=en&th=10');
  assert.ok(list.json.items.some((/** @type {any} */ c) => c.slug === slug));
  assert.equal((await anon.get('/api/clans?q=wolves&th=5')).json.items.some((/** @type {any} */ c) => c.slug === slug), false, 'min TH filter');
  assert.equal((await anon.get('/api/clans?type=closed&q=wolves')).json.items.length, 0);
  assert.equal((await anon.get('/api/clans?q=%25')).json.items.length, 0);
  assert.equal((await anon.get('/api/clans?sort=bogus&type=bogus')).status, 200);

  const low = await signup(app.base, { profile: { thLevel: 6, trophies: 900 } });
  const unknown = await signup(app.base);
  const lowFit = (await low.c.get('/api/clans?q=wolves')).json.items[0].fit;
  assert.equal(lowFit.allowed, false);
  assert.equal(lowFit.reason, 'th_too_low');
  assert.equal((await unknown.c.get('/api/clans?q=wolves')).json.items[0].fit.reason, 'th_unknown');
  assert.equal((await low.c.get('/api/clans?q=wolves&qualify=1')).json.items.length, 0, '"I qualify" filter');
  assert.equal((await other.c.get('/api/clans?q=wolves&qualify=1')).json.items.length, 1);

  assert.equal((await low.c.post(`/api/clans/${slug}/join`, {})).status, 403);
  const joined = await other.c.post(`/api/clans/${slug}/join`, {});
  assert.equal(joined.status, 201);
  assert.equal(joined.json.status, 'joined');
  const detail = await anon.get(`/api/clans/${slug}`);
  assert.equal(detail.json.members.length, 2);
  assert.equal(detail.json.members[0].handle, leader.handle, 'leader listed first');
  assert.equal(detail.json.viewer.role, null);
  assert.equal(detail.json.viewer.join.reason, 'signed_out');
  assert.equal((await other.c.get(`/api/clans/${slug}`)).json.viewer.role, 'member');
  assert.equal((await other.c.post(`/api/clans/${slug}/join`, {})).status, 409);
  assert.equal((await anon.get('/api/clans/does-not-exist')).status, 404);
});

test('invite-only flow, request authorization and recruiter achievement', async () => {
  const leader = await signup(app.base, { profile: { thLevel: 15, trophies: 4500 } });
  const slug = (await leader.c.post('/api/clans', clanBody({ name: 'Silent Order', type: 'invite' }))).json.clan.slug;
  const applicant = await signup(app.base, { profile: { thLevel: 10, trophies: 2000 } });
  const bystander = await signup(app.base);

  const req = await applicant.c.post(`/api/clans/${slug}/join`, { message: 'Active daily, 5 wars/month.' });
  assert.equal(req.status, 201);
  assert.equal(req.json.status, 'requested');
  assert.equal((await applicant.c.post(`/api/clans/${slug}/join`, {})).status, 409, 'duplicate request');
  assert.equal((await applicant.c.get(`/api/clans/${slug}`)).json.viewer.pendingRequest.id, req.json.requestId);

  // authorization: only staff can see/resolve requests
  assert.equal((await client(app.base).get(`/api/clans/${slug}/requests`)).status, 401);
  assert.equal((await bystander.c.get(`/api/clans/${slug}/requests`)).status, 403);
  assert.equal((await applicant.c.get(`/api/clans/${slug}/requests`)).status, 403);
  assert.equal((await applicant.c.post(`/api/clans/${slug}/requests/${req.json.requestId}/accept`, {})).status, 403, 'applicant cannot approve themself');

  const pending = await leader.c.get(`/api/clans/${slug}/requests`);
  assert.equal(pending.json.items.length, 1);
  assert.equal(pending.json.items[0].applicant.handle, applicant.handle);
  assert.equal('email' in pending.json.items[0].applicant, false);
  assert.equal((await leader.c.get(`/api/clans/${slug}`)).json.viewer.pendingCount, 1);

  assert.equal((await leader.c.post(`/api/clans/${slug}/requests/${req.json.requestId}/accept`, {})).status, 200);
  assert.equal((await leader.c.post(`/api/clans/${slug}/requests/${req.json.requestId}/accept`, {})).status, 409, 'cannot resolve twice');
  assert.equal((await applicant.c.get('/api/me')).json.user.clan.slug, slug);
  assert.equal((await applicant.c.get('/api/me')).json.achievements.find((/** @type {any} */ a) => a.id === 'clan-mate').earned, true);
  assert.equal((await leader.c.get('/api/me')).json.user.clan.role, 'leader');

  // decline + cancel paths
  const other = await signup(app.base, { profile: { thLevel: 11, trophies: 1500 } });
  const r2 = await other.c.post(`/api/clans/${slug}/join`, {});
  assert.equal((await other.c.del(`/api/requests/${r2.json.requestId}`)).status, 200);
  assert.equal((await other.c.del(`/api/requests/${r2.json.requestId}`)).status, 409);
  assert.equal((await bystander.c.del(`/api/requests/${r2.json.requestId}`)).status, 404, 'cannot cancel someone else\'s request');
  const r3 = await other.c.post(`/api/clans/${slug}/join`, {});
  assert.equal((await leader.c.post(`/api/clans/${slug}/requests/${r3.json.requestId}/decline`, {})).status, 200);
  const mine = await other.c.get('/api/me/requests');
  assert.deepEqual(mine.json.items.map((/** @type {any} */ i) => i.status).sort(), ['cancelled', 'declined']);

  // closed clans reject everyone
  await leader.c.patch(`/api/clans/${slug}`, { type: 'closed' });
  assert.equal((await other.c.post(`/api/clans/${slug}/join`, {})).status, 409);
});

test('member management authorization matrix', async () => {
  const L = await signup(app.base, { profile: { thLevel: 15, trophies: 4000 } });
  const slug = (await L.c.post('/api/clans', clanBody({ name: 'Matrix Clan' }))).json.clan.slug;
  const co = await signup(app.base, { profile: { thLevel: 12 } });
  const elder = await signup(app.base, { profile: { thLevel: 12 } });
  const mem = await signup(app.base, { profile: { thLevel: 12 } });
  const outsider = await signup(app.base, { profile: { thLevel: 12 } });
  for (const p of [co, elder, mem]) assert.equal((await p.c.post(`/api/clans/${slug}/join`, {})).json.status, 'joined');

  // only the leader can change roles
  assert.equal((await mem.c.post(`/api/clans/${slug}/members/${mem.handle}/role`, { role: 'coleader' })).status, 403, 'no self-promotion');
  assert.equal((await outsider.c.post(`/api/clans/${slug}/members/${mem.handle}/role`, { role: 'elder' })).status, 403);
  assert.equal((await L.c.post(`/api/clans/${slug}/members/${co.handle}/role`, { role: 'coleader' })).status, 200);
  assert.equal((await L.c.post(`/api/clans/${slug}/members/${elder.handle}/role`, { role: 'elder' })).status, 200);
  assert.equal((await co.c.post(`/api/clans/${slug}/members/${mem.handle}/role`, { role: 'elder' })).status, 403, 'co-leaders cannot change roles');
  assert.equal((await L.c.post(`/api/clans/${slug}/members/${mem.handle}/role`, { role: 'leader' })).status, 422, 'cannot grant leader via role endpoint');
  assert.equal((await L.c.post(`/api/clans/${slug}/members/${outsider.handle}/role`, { role: 'elder' })).status, 404);

  // kicking
  assert.equal((await elder.c.del(`/api/clans/${slug}/members/${mem.handle}`)).status, 403, 'elders cannot kick');
  assert.equal((await mem.c.del(`/api/clans/${slug}/members/${elder.handle}`)).status, 403);
  assert.equal((await co.c.del(`/api/clans/${slug}/members/${L.handle}`)).status, 403, 'cannot kick the leader');
  assert.equal((await co.c.del(`/api/clans/${slug}/members/${co.handle}`)).status, 403, 'cannot kick yourself');
  assert.equal((await co.c.del(`/api/clans/${slug}/members/${elder.handle}`)).status, 200, 'co-leader kicks elder');
  assert.equal((await L.c.get('/api/clans/' + slug)).json.members.length, 3);
  assert.equal((await client(app.base).get('/api/players/' + elder.handle)).json.user.clan, null);

  // editing & deleting
  assert.equal((await mem.c.patch(`/api/clans/${slug}`, { name: 'Hijacked' })).status, 403);
  assert.equal((await outsider.c.patch(`/api/clans/${slug}`, { name: 'Hijacked' })).status, 403);
  assert.equal((await co.c.patch(`/api/clans/${slug}`, { description: 'Updated by co-leader', minTh: 11 })).status, 200);
  assert.equal((await co.c.del(`/api/clans/${slug}`, { confirmName: 'Matrix Clan' })).status, 403, 'co-leaders cannot delete');
  assert.equal((await mem.c.post(`/api/clans/${slug}/transfer`, { handle: mem.handle })).status, 403);

  // leaving & transfer
  assert.equal((await L.c.post(`/api/clans/${slug}/leave`, {})).status, 409, 'leader must transfer first');
  assert.equal((await outsider.c.post(`/api/clans/${slug}/leave`, {})).status, 403);
  assert.equal((await L.c.post(`/api/clans/${slug}/transfer`, { handle: co.handle })).status, 200);
  assert.equal((await co.c.get('/api/me')).json.user.clan.role, 'leader');
  assert.equal((await L.c.get('/api/me')).json.user.clan.role, 'coleader');
  assert.equal((await L.c.post(`/api/clans/${slug}/leave`, {})).status, 200);
  assert.equal((await L.c.get('/api/me')).json.user.clan, null);

  // deleting a leader's account with members is blocked
  assert.equal((await co.c.del('/api/me', { password: 'correct-horse-battery' })).status, 409);
  assert.equal((await co.c.del(`/api/clans/${slug}`, { confirmName: 'wrong' })).status, 422);
  assert.equal((await co.c.del(`/api/clans/${slug}`, { confirmName: 'matrix clan' })).status, 200);
  assert.equal((await mem.c.get('/api/me')).json.user.clan, null, 'members are released when a clan is deleted');
  assert.equal((await client(app.base).get(`/api/clans/${slug}`)).status, 404);
});

test('clan capacity is enforced', async () => {
  const L = await signup(app.base);
  const slug = (await L.c.post('/api/clans', clanBody({ name: 'Tiny Keep' }))).json.clan.slug;
  const now = new Date().toISOString();
  const clanId = /** @type {any} */ (app.db.prepare('SELECT id FROM clans WHERE slug=?').get(slug)).id;
  const ins = app.db.prepare("INSERT INTO users(email,password_hash,handle,display_name,clan_id,clan_role,created_at,updated_at) VALUES(?,?,?,?,?,'member',?,?)");
  for (let i = 0; i < 49; i++) ins.run(`fill${i}@x.io`, 'x', `fill${i}`, `Fill ${i}`, clanId, now, now);
  const late = await signup(app.base);
  const res = await late.c.post(`/api/clans/${slug}/join`, {});
  assert.equal(res.status, 409);
  assert.equal(res.json.error.code, 'full');
  assert.equal((await client(app.base).get('/api/clans?q=Tiny&slots=1')).json.items.length, 0, 'slots filter hides full clans');
  const stats = (await client(app.base).get('/api/stats')).json;
  assert.ok(stats.players > 50 && stats.clans >= 1 && typeof stats.openClans === 'number');
});

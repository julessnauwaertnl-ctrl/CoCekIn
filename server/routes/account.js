import { AVATARS, COVERS, LANGUAGES, MAX_TH, RESERVED_HANDLES, TROOPS, normalizeTag } from '../../shared/game.js';
import { Validator } from '../validate.js';
import { HttpError, conflict, forbidden, notFound } from '../errors.js';
import { now, tx } from '../db.js';
import { DUMMY_HASH, createSession, destroyOtherSessions, destroySession, hashPassword, verifyPassword } from '../auth.js';
import { achievementsFor, getUserById, serializeClan, serializeUser, CLAN_SQL } from '../models.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** @param {any} config @param {string} token @param {number} maxAgeSec */
const sessionCookie = (config, token, maxAgeSec) =>
  `${config.cookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${config.cookieSecure ? '; Secure' : ''}`;

/** @param {unknown} e */
const isUnique = (e) => e instanceof Error && /UNIQUE constraint failed/i.test(e.message);

/** @param {import('../router.js').Router} r @param {any} app */
export function registerAccountRoutes(r, app) {
  const { db, config, limiter, coc } = app;

  const meBody = (/** @type {number} */ id) => {
    const row = getUserById(db, id);
    if (!row) throw notFound('Account not found.');
    return { user: serializeUser(row, { self: true }), achievements: achievementsFor(row) };
  };

  r.post('/api/auth/register', {}, async (ctx) => {
    const l = config.limits.register;
    const rl = limiter.hit(`register:${ctx.ip}`, l.max, l.windowMs);
    if (!rl.ok) throw new HttpError(429, 'Too many sign-ups from this network. Try again later.', 'rate_limited');
    const v = new Validator(ctx.body)
      .string('email', { max: 254, lower: true, label: 'Email', pattern: EMAIL_RE, patternMsg: 'Enter a valid email address.' })
      .string('handle', { min: 3, max: 20, lower: true, label: 'Username', pattern: /^[a-z0-9_]+$/, patternMsg: 'Use only letters, numbers and underscores.' })
      .string('displayName', { min: 2, max: 30, label: 'Display name' });
    const password = ctx.body?.password;
    if (typeof password !== 'string' || password.length < 10 || password.length > 128) v.fail('password', 'Password must be 10–128 characters.');
    const out = v.done();
    if (RESERVED_HANDLES.has(out.handle)) throw conflict('That username is reserved.', 'conflict', { handle: 'That username is reserved.' });
    const hash = await hashPassword(password);
    let id;
    try {
      id = tx(db, () => {
        if (db.prepare('SELECT 1 FROM users WHERE email=?').get(out.email)) throw conflict('That email is already registered.', 'conflict', { email: 'That email is already registered.' });
        if (db.prepare('SELECT 1 FROM users WHERE handle=?').get(out.handle)) throw conflict('That username is taken.', 'conflict', { handle: 'That username is taken.' });
        const t = now();
        const res = db.prepare(`INSERT INTO users(email,password_hash,handle,display_name,avatar,cover,created_at,updated_at)
          VALUES(?,?,?,?,?,?,?,?)`).run(out.email, hash, out.handle, out.displayName,
          AVATARS[Math.floor(Math.random() * 6)], COVERS[Math.floor(Math.random() * COVERS.length)].key, t, t);
        return Number(res.lastInsertRowid);
      });
    } catch (e) {
      if (isUnique(e)) throw conflict('That email or username is already taken.');
      throw e;
    }
    const s = createSession(db, id, config.sessionDays, String(ctx.req.headers['user-agent'] || ''));
    ctx.cookies.push(sessionCookie(config, s.token, config.sessionDays * 86400));
    ctx.status = 201;
    return meBody(id);
  });

  r.post('/api/auth/login', {}, async (ctx) => {
    const email = typeof ctx.body?.email === 'string' ? ctx.body.email.trim().toLowerCase() : '';
    const password = typeof ctx.body?.password === 'string' ? ctx.body.password : '';
    const l = config.limits.login;
    const k1 = `login:${ctx.ip}:${email}`;
    const a = limiter.hit(k1, l.max, l.windowMs);
    const b = limiter.hit(`login-ip:${ctx.ip}`, l.max * 5, l.windowMs);
    if (!a.ok || !b.ok) {
      ctx.res.setHeader('Retry-After', String(Math.max(a.retryAfter, b.retryAfter)));
      throw new HttpError(429, 'Too many sign-in attempts. Please wait a few minutes and try again.', 'rate_limited');
    }
    if (!email || !password || password.length > 128) throw new HttpError(401, 'Incorrect email or password.', 'bad_credentials');
    const row = /** @type {{id:number,password_hash:string}|undefined} */ (db.prepare('SELECT id, password_hash FROM users WHERE email=?').get(email));
    const ok = await verifyPassword(password, row ? row.password_hash : DUMMY_HASH);
    if (!row || !ok) throw new HttpError(401, 'Incorrect email or password.', 'bad_credentials');
    limiter.reset(k1);
    const s = createSession(db, row.id, config.sessionDays, String(ctx.req.headers['user-agent'] || ''));
    ctx.cookies.push(sessionCookie(config, s.token, config.sessionDays * 86400));
    return meBody(row.id);
  });

  r.post('/api/auth/logout', {}, (ctx) => {
    if (ctx.token) destroySession(db, ctx.token);
    ctx.cookies.push(sessionCookie(config, '', 0));
    return { ok: true };
  });

  r.get('/api/me', {}, (ctx) => (ctx.user ? meBody(ctx.user.id) : { user: null, achievements: [] }));

  r.patch('/api/me', { auth: 'required' }, (ctx) => {
    const u = ctx.user;
    const v = new Validator(ctx.body)
      .string('displayName', { min: 2, max: 30, required: false, label: 'Display name' })
      .string('bio', { max: 280, required: false, multiline: true, label: 'Bio' })
      .int('thLevel', { min: 1, max: MAX_TH, required: false, nullable: true, label: 'Town Hall level' })
      .int('trophies', { min: 0, max: 10000, required: false, nullable: true, label: 'Trophies' })
      .int('bestTrophies', { min: 0, max: 10000, required: false, nullable: true, label: 'Best trophies' })
      .int('warStars', { min: 0, max: 100000, required: false, nullable: true, label: 'War stars' })
      .int('donations', { min: 0, max: 10000000, required: false, nullable: true, label: 'Donations' })
      .oneOf('favoriteTroop', TROOPS, { required: false, nullable: true, label: 'Favourite unit' })
      .oneOf('avatar', AVATARS, { required: false, label: 'Avatar' })
      .oneOf('cover', COVERS.map((c) => c.key), { required: false, label: 'Cover' })
      .oneOf('language', LANGUAGES.map((l) => l.key), { required: false, label: 'Language' })
      .bool('lookingForClan', { label: 'Looking for clan' });
    if (v.has('playerTag')) {
      const raw = ctx.body.playerTag;
      if (raw === null || raw === '') v.out.playerTag = null;
      else { const t = normalizeTag(raw); if (t) v.out.playerTag = t; else v.fail('playerTag', 'Enter a valid player tag, e.g. #2PP0LRQ.'); }
    }
    const o = v.done();

    const statKeys = ['thLevel', 'trophies', 'bestTrophies', 'warStars', 'donations'];
    const tagChanged = 'playerTag' in o && o.playerTag !== u.player_tag;
    if (u.verified && u.stats_source === 'api' && !tagChanged && statKeys.some((k) => k in o)) {
      throw conflict('Your stats are synced from the official game API. Use “Sync now” to refresh them.', 'stats_locked');
    }
    const trophies = 'trophies' in o ? o.trophies : u.trophies;
    const best = 'bestTrophies' in o ? o.bestTrophies : u.best_trophies;
    if (trophies != null && best != null && best < trophies) {
      throw new HttpError(422, 'Please fix the highlighted fields.', 'validation', { bestTrophies: 'Best trophies cannot be lower than current trophies.' });
    }
    const map = { displayName: 'display_name', bio: 'bio', playerTag: 'player_tag', thLevel: 'th_level', trophies: 'trophies',
      bestTrophies: 'best_trophies', warStars: 'war_stars', donations: 'donations', favoriteTroop: 'favorite_troop',
      avatar: 'avatar', cover: 'cover', language: 'language', lookingForClan: 'looking_for_clan' };
    /** @type {string[]} */ const sets = [];
    /** @type {any[]} */ const vals = [];
    for (const [k, col] of Object.entries(map)) {
      if (!(k in o)) continue;
      sets.push(`${col}=?`);
      vals.push(typeof o[k] === 'boolean' ? Number(o[k]) : o[k]);
    }
    if (tagChanged) sets.push("verified=0, stats_source='self', stats_synced_at=NULL");
    if (!sets.length) return meBody(u.id);
    sets.push('updated_at=?'); vals.push(now());
    try {
      db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id=?`).run(...vals, u.id);
    } catch (e) { if (isUnique(e)) throw conflict('That player tag is already verified by another account.'); throw e; }
    return meBody(u.id);
  });

  r.post('/api/me/password', { auth: 'required' }, async (ctx) => {
    const { currentPassword, newPassword } = ctx.body || {};
    if (typeof currentPassword !== 'string' || !(await verifyPassword(currentPassword, ctx.user.password_hash))) {
      throw new HttpError(422, 'Please fix the highlighted fields.', 'validation', { currentPassword: 'Current password is incorrect.' });
    }
    if (typeof newPassword !== 'string' || newPassword.length < 10 || newPassword.length > 128) {
      throw new HttpError(422, 'Please fix the highlighted fields.', 'validation', { newPassword: 'New password must be 10–128 characters.' });
    }
    const hash = await hashPassword(newPassword);
    db.prepare('UPDATE users SET password_hash=?, updated_at=? WHERE id=?').run(hash, now(), ctx.user.id);
    destroyOtherSessions(db, ctx.user.id, ctx.token);
    return { ok: true };
  });

  r.del('/api/me', { auth: 'required' }, async (ctx) => {
    const pw = ctx.body?.password;
    if (typeof pw !== 'string' || !(await verifyPassword(pw, ctx.user.password_hash))) {
      throw new HttpError(422, 'Please fix the highlighted fields.', 'validation', { password: 'Password is incorrect.' });
    }
    tx(db, () => {
      const u = ctx.user;
      if (u.clan_id && u.clan_role === 'leader') {
        const n = /** @type {{n:number}} */ (db.prepare('SELECT COUNT(*) AS n FROM users WHERE clan_id=?').get(u.clan_id)).n;
        if (n > 1) throw conflict('Transfer leadership of your clan before deleting your account.', 'transfer_required');
        db.prepare('DELETE FROM clans WHERE id=?').run(u.clan_id);
      }
      db.prepare('DELETE FROM users WHERE id=?').run(u.id);
    });
    ctx.cookies.push(sessionCookie(config, '', 0));
    return { ok: true };
  });

  /** Pull stats from the official API into a verified account. */
  async function syncFromApi(/** @type {any} */ user) {
    const p = await coc.getPlayer(user.player_tag);
    const best = p.bestTrophies != null && p.trophies != null ? Math.max(p.bestTrophies, p.trophies) : p.bestTrophies;
    db.prepare(`UPDATE users SET th_level=?, trophies=?, best_trophies=?, war_stars=?, donations=?, stats_source='api',
      stats_synced_at=?, updated_at=? WHERE id=?`).run(p.thLevel, p.trophies, best, p.warStars, p.donations, now(), now(), user.id);
  }

  r.post('/api/me/verify', { auth: 'required' }, async (ctx) => {
    if (!coc.configured) throw new HttpError(503, 'Account verification is not enabled on this server yet.', 'coc_not_configured');
    const tag = normalizeTag(ctx.body?.playerTag);
    const token = typeof ctx.body?.apiToken === 'string' ? ctx.body.apiToken.trim() : '';
    if (!tag) throw new HttpError(422, 'Please fix the highlighted fields.', 'validation', { playerTag: 'Enter a valid player tag, e.g. #2PP0LRQ.' });
    if (!token || token.length > 64) throw new HttpError(422, 'Please fix the highlighted fields.', 'validation', { apiToken: 'Paste the API token from your in-game settings.' });
    const l = config.limits.login;
    const rl = limiter.hit(`verify:${ctx.user.id}`, l.max, l.windowMs);
    if (!rl.ok) throw new HttpError(429, 'Too many verification attempts. Try again later.', 'rate_limited');
    const ok = await coc.verifyToken(tag, token);
    if (!ok) throw new HttpError(422, 'That token does not belong to this player tag.', 'validation', { apiToken: 'That token does not match this player tag.' });
    try {
      db.prepare("UPDATE users SET player_tag=?, verified=1, stats_source='api', updated_at=? WHERE id=?").run(tag, now(), ctx.user.id);
    } catch (e) { if (isUnique(e)) throw conflict('That player tag is already verified by another account.'); throw e; }
    try { await syncFromApi({ ...ctx.user, player_tag: tag }); } catch (e) {
      // Verification itself succeeded; stats can be synced later.
      if (!(e instanceof HttpError)) throw e;
    }
    return meBody(ctx.user.id);
  });

  r.post('/api/me/sync', { auth: 'required' }, async (ctx) => {
    if (!coc.configured) throw new HttpError(503, 'Stat syncing is not enabled on this server yet.', 'coc_not_configured');
    if (!ctx.user.verified || !ctx.user.player_tag) throw forbidden('Verify your in-game account first.', 'not_verified');
    const l = config.limits.login;
    const rl = limiter.hit(`sync:${ctx.user.id}`, l.max, l.windowMs);
    if (!rl.ok) throw new HttpError(429, 'You are syncing too often. Try again in a few minutes.', 'rate_limited');
    await syncFromApi(ctx.user);
    return meBody(ctx.user.id);
  });

  r.get('/api/me/requests', { auth: 'required' }, (ctx) => {
    const rows = /** @type {any[]} */ (db.prepare(`SELECT r.id, r.message, r.status, r.created_at, r.resolved_at, r.clan_id
      FROM join_requests r WHERE r.user_id=? ORDER BY r.id DESC LIMIT 20`).all(ctx.user.id));
    const items = rows.map((q) => {
      const clan = /** @type {any} */ (db.prepare(`${CLAN_SQL} WHERE c.id=? GROUP BY c.id`).get(q.clan_id));
      return { id: q.id, message: q.message, status: q.status, createdAt: q.created_at, resolvedAt: q.resolved_at, clan: clan ? serializeClan(clan) : null };
    });
    return { items };
  });

  r.del('/api/requests/:id', { auth: 'required' }, (ctx) => {
    const id = Number(ctx.params.id);
    const row = Number.isInteger(id) ? /** @type {any} */ (db.prepare('SELECT * FROM join_requests WHERE id=?').get(id)) : null;
    if (!row || row.user_id !== ctx.user.id) throw notFound('Request not found.');
    if (row.status !== 'pending') throw conflict('That request has already been resolved.', 'already_resolved');
    db.prepare("UPDATE join_requests SET status='cancelled', resolved_at=? WHERE id=?").run(now(), id);
    return { ok: true };
  });
}

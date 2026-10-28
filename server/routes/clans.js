import {
  CLAN_MAX_MEMBERS, CLAN_TYPES, EMBLEMS, FOCUSES, LANGUAGES, MAX_TH, PALETTE, COVERS, RESERVED_SLUGS, WAR_FREQUENCIES, normalizeTag,
} from '../../shared/game.js';
import { Validator, escapeLike, slugify } from '../validate.js';
import { HttpError, conflict, forbidden, notFound } from '../errors.js';
import { now, tx } from '../db.js';
import { CLAN_SQL, USER_SQL, getClanById, getClanBySlug, getUserByHandle, joinEligibility, roleRank, serializeClan, serializeUser } from '../models.js';
import { intParam, pageParams, pageResult } from '../util.js';

/** @typedef {Record<string, any>} Row */

const SORTS = /** @type {Record<string,string>} */ ({
  members: 'member_count DESC, c.id DESC',
  trophies: 'total_trophies DESC, c.id DESC',
  newest: 'c.id DESC',
  name: 'c.name COLLATE NOCASE ASC',
});

/** @param {Record<string,any>} body @param {boolean} partial */
function validateClan(body, partial) {
  const req = !partial;
  const v = new Validator(body)
    .string('name', { min: 3, max: 30, required: req, label: 'Clan name', pattern: /^[\p{L}\p{N} '’._-]+$/u, patternMsg: 'Use letters, numbers, spaces and . _ - only.' })
    .string('description', { max: 300, required: false, multiline: true, label: 'Description' })
    .oneOf('type', CLAN_TYPES.map((t) => t.key), { required: req, label: 'Clan type' })
    .int('minTh', { min: 1, max: MAX_TH, required: req, label: 'Minimum Town Hall' })
    .int('minTrophies', { min: 0, max: 10000, required: req, label: 'Minimum trophies' })
    .oneOf('language', LANGUAGES.map((l) => l.key), { required: req, label: 'Language' })
    .oneOf('warFrequency', WAR_FREQUENCIES.map((w) => w.key), { required: req, label: 'War frequency' })
    .oneOf('focus', FOCUSES.map((f) => f.key), { required: req, label: 'Focus' })
    .oneOf('emblem', EMBLEMS, { required: req, label: 'Emblem' })
    .oneOf('color', Object.keys(PALETTE), { required: req, label: 'Badge colour' })
    .oneOf('banner', COVERS.map((c) => c.key), { required: req, label: 'Banner' });
  if (v.has('tag')) {
    if (body.tag === null || body.tag === '') v.out.tag = null;
    else { const t = normalizeTag(body.tag); if (t) v.out.tag = t; else v.fail('tag', 'Enter a valid clan tag, e.g. #2YG9RQ.'); }
  }
  return v.done();
}

/** @param {import('../router.js').Router} r @param {any} app */
export function registerClanRoutes(r, app) {
  const { db } = app;

  /** @param {Row} user @param {Row} clan @param {number} minRank */
  function requireRank(user, clan, minRank) {
    if (user.clan_id !== clan.id || roleRank(user.clan_role) < minRank) throw forbidden('You do not have permission to do that in this clan.');
  }

  /** @param {string} slug */
  function loadClan(slug) {
    const c = getClanBySlug(db, slug);
    if (!c) throw notFound('That clan does not exist.');
    return c;
  }

  const cancelPending = (/** @type {number} */ userId) =>
    db.prepare("UPDATE join_requests SET status='cancelled', resolved_at=? WHERE user_id=? AND status='pending'").run(now(), userId);

  /* ---------- Discovery ---------- */
  r.get('/api/clans', {}, (ctx) => {
    const q = ctx.query;
    const where = [];
    const having = [];
    /** @type {any[]} */ const params = [];
    if (q.q?.trim()) {
      const like = `%${escapeLike(q.q.trim().slice(0, 40))}%`;
      where.push("(c.name LIKE ? ESCAPE '\\' OR c.tag LIKE ? ESCAPE '\\' OR c.description LIKE ? ESCAPE '\\')");
      params.push(like, like, like);
    }
    const types = (q.type || '').split(',').filter((t) => CLAN_TYPES.some((x) => x.key === t));
    if (types.length) { where.push(`c.type IN (${types.map(() => '?').join(',')})`); params.push(...types); }
    if (q.language && LANGUAGES.some((l) => l.key === q.language)) { where.push('c.language = ?'); params.push(q.language); }
    if (q.war && WAR_FREQUENCIES.some((w) => w.key === q.war)) { where.push('c.war_frequency = ?'); params.push(q.war); }
    if (q.focus && FOCUSES.some((f) => f.key === q.focus)) { where.push('c.focus = ?'); params.push(q.focus); }
    const th = intParam(q.th, 1, MAX_TH);
    if (th != null) { where.push('c.min_th <= ?'); params.push(th); }
    const tr = intParam(q.trophies, 0, 10000);
    if (tr != null) { where.push('c.min_trophies <= ?'); params.push(tr); }
    if (q.qualify === '1' && ctx.user) {
      where.push("c.min_th <= ? AND c.min_trophies <= ? AND c.type <> 'closed'");
      params.push(ctx.user.th_level ?? 0, ctx.user.trophies ?? 0);
    }
    if (q.slots === '1') having.push(`member_count < ${CLAN_MAX_MEMBERS}`);
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const h = having.length ? `HAVING ${having.join(' AND ')}` : '';

    const viewerTh = ctx.user ? (ctx.user.th_level ?? 0) : 99;
    const viewerTr = ctx.user ? (ctx.user.trophies ?? 0) : 99999;
    const viewerLang = ctx.user?.language ?? '';
    const matchOrder = `(member_count >= ${CLAN_MAX_MEMBERS}) ASC,
      (CASE WHEN c.min_th <= ? AND c.min_trophies <= ? AND c.type <> 'closed' THEN 1 ELSE 0 END) DESC,
      (c.language = ?) DESC,
      (CASE c.type WHEN 'open' THEN 0 WHEN 'invite' THEN 1 ELSE 2 END) ASC, member_count DESC, c.id DESC`;
    const sort = q.sort && SORTS[q.sort] ? q.sort : 'match';
    const order = sort === 'match' ? matchOrder : SORTS[sort];
    const orderParams = sort === 'match' ? [viewerTh, viewerTr, viewerLang] : [];

    const p = pageParams(q);
    const base = `${CLAN_SQL} ${w} GROUP BY c.id ${h}`;
    const total = /** @type {{n:number}} */ (db.prepare(`SELECT COUNT(*) AS n FROM (${base})`).get(...params)).n;
    const rows = /** @type {Row[]} */ (db.prepare(`${base} ORDER BY ${order} LIMIT ? OFFSET ?`).all(...params, ...orderParams, p.size, p.offset));
    const items = rows.map((c) => ({ ...serializeClan(c), fit: ctx.user ? joinEligibility(ctx.user, c) : null }));
    return pageResult(items, total, p);
  });

  /* ---------- Detail ---------- */
  r.get('/api/clans/:slug', {}, (ctx) => {
    const c = loadClan(ctx.params.slug);
    const members = /** @type {Row[]} */ (db.prepare(`${USER_SQL} WHERE u.clan_id = ?
      ORDER BY CASE u.clan_role WHEN 'leader' THEN 0 WHEN 'coleader' THEN 1 WHEN 'elder' THEN 2 ELSE 3 END, u.trophies IS NULL, u.trophies DESC, u.id`).all(c.id));
    const u = ctx.user;
    const myRole = u && u.clan_id === c.id ? u.clan_role : null;
    const pending = u ? /** @type {Row|undefined} */ (db.prepare("SELECT id, message, created_at FROM join_requests WHERE clan_id=? AND user_id=? AND status='pending'").get(c.id, u.id)) : undefined;
    const pendingCount = roleRank(myRole) >= 3
      ? /** @type {{n:number}} */ (db.prepare("SELECT COUNT(*) AS n FROM join_requests WHERE clan_id=? AND status='pending'").get(c.id)).n : 0;
    return {
      clan: serializeClan(c),
      members: members.map((m) => serializeUser(m)),
      viewer: {
        role: myRole,
        join: joinEligibility(u ?? null, c),
        pendingRequest: pending ? { id: pending.id, message: pending.message, createdAt: pending.created_at } : null,
        canEdit: roleRank(myRole) >= 3,
        isLeader: myRole === 'leader',
        pendingCount,
      },
    };
  });

  /* ---------- Create / edit / delete ---------- */
  r.post('/api/clans', { auth: 'required' }, (ctx) => {
    const o = validateClan(ctx.body, false);
    const clan = tx(db, () => {
      const me = /** @type {Row} */ (db.prepare('SELECT clan_id FROM users WHERE id=?').get(ctx.user.id));
      if (me.clan_id) throw conflict('Leave your current clan before founding a new one.', 'in_clan');
      if (db.prepare('SELECT 1 FROM clans WHERE name=?').get(o.name)) throw conflict('A clan with that name already exists.', 'conflict', { name: 'A clan with that name already exists.' });
      let base = slugify(o.name);
      if (RESERVED_SLUGS.has(base)) base = `${base}-clan`;
      let slug = base; let n = 2;
      while (db.prepare('SELECT 1 FROM clans WHERE slug=?').get(slug)) slug = `${base}-${n++}`;
      const t = now();
      const res = db.prepare(`INSERT INTO clans(slug,name,tag,description,type,min_th,min_trophies,language,war_frequency,focus,emblem,color,banner,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(slug, o.name, o.tag ?? null, o.description ?? '', o.type, o.minTh, o.minTrophies,
        o.language, o.warFrequency, o.focus, o.emblem, o.color, o.banner, t, t);
      const id = Number(res.lastInsertRowid);
      db.prepare("UPDATE users SET clan_id=?, clan_role='leader', updated_at=? WHERE id=?").run(id, t, ctx.user.id);
      cancelPending(ctx.user.id);
      return getClanById(db, id);
    });
    ctx.status = 201;
    return { clan: serializeClan(/** @type {Row} */ (clan)) };
  });

  r.patch('/api/clans/:slug', { auth: 'required' }, (ctx) => {
    const c = loadClan(ctx.params.slug);
    requireRank(ctx.user, c, 3);
    const o = validateClan(ctx.body, true);
    if (o.name && o.name.toLowerCase() !== c.name.toLowerCase() && db.prepare('SELECT 1 FROM clans WHERE name=? AND id<>?').get(o.name, c.id)) {
      throw conflict('A clan with that name already exists.', 'conflict', { name: 'A clan with that name already exists.' });
    }
    const map = { name: 'name', tag: 'tag', description: 'description', type: 'type', minTh: 'min_th', minTrophies: 'min_trophies',
      language: 'language', warFrequency: 'war_frequency', focus: 'focus', emblem: 'emblem', color: 'color', banner: 'banner' };
    /** @type {string[]} */ const sets = [];
    /** @type {any[]} */ const vals = [];
    for (const [k, col] of Object.entries(map)) if (k in o) { sets.push(`${col}=?`); vals.push(o[k]); }
    if (sets.length) {
      sets.push('updated_at=?'); vals.push(now());
      db.prepare(`UPDATE clans SET ${sets.join(', ')} WHERE id=?`).run(...vals, c.id);
    }
    return { clan: serializeClan(/** @type {Row} */ (getClanById(db, c.id))) };
  });

  r.del('/api/clans/:slug', { auth: 'required' }, (ctx) => {
    const c = loadClan(ctx.params.slug);
    requireRank(ctx.user, c, 4);
    const confirm = typeof ctx.body?.confirmName === 'string' ? ctx.body.confirmName.trim().toLowerCase() : '';
    if (confirm !== c.name.toLowerCase()) {
      throw new HttpError(422, 'Please fix the highlighted fields.', 'validation', { confirmName: 'Type the clan name exactly to confirm.' });
    }
    tx(db, () => {
      db.prepare('UPDATE users SET clan_id=NULL, clan_role=NULL WHERE clan_id=?').run(c.id);
      db.prepare('DELETE FROM clans WHERE id=?').run(c.id);
    });
    return { ok: true };
  });

  /* ---------- Joining & leaving ---------- */
  r.post('/api/clans/:slug/join', { auth: 'required' }, (ctx) => {
    const v = new Validator(ctx.body).string('message', { max: 200, required: false, multiline: true, label: 'Message' });
    const o = v.done();
    const result = tx(db, () => {
      const c = loadClan(ctx.params.slug);
      const me = /** @type {Row} */ (getUserByHandle(db, ctx.user.handle));
      const fit = joinEligibility(me, c);
      if (!fit.allowed) throw new HttpError(['closed', 'full', 'member', 'in_other_clan'].includes(String(fit.reason)) ? 409 : 403, fit.message || 'You cannot join this clan.', fit.reason || 'cannot_join');
      if (c.type === 'open') {
        db.prepare("UPDATE users SET clan_id=?, clan_role='member', updated_at=? WHERE id=?").run(c.id, now(), me.id);
        cancelPending(me.id);
        return { status: 'joined' };
      }
      if (db.prepare("SELECT 1 FROM join_requests WHERE clan_id=? AND user_id=? AND status='pending'").get(c.id, me.id)) {
        throw conflict('You already have a pending request for this clan.', 'already_requested');
      }
      const open = /** @type {{n:number}} */ (db.prepare("SELECT COUNT(*) AS n FROM join_requests WHERE user_id=? AND status='pending'").get(me.id)).n;
      if (open >= 5) throw conflict('You can have at most 5 pending requests. Cancel one first.', 'too_many_requests');
      const res = db.prepare('INSERT INTO join_requests(clan_id,user_id,message,created_at) VALUES(?,?,?,?)').run(c.id, me.id, o.message ?? '', now());
      return { status: 'requested', requestId: Number(res.lastInsertRowid) };
    });
    ctx.status = 201;
    return result;
  });

  r.post('/api/clans/:slug/leave', { auth: 'required' }, (ctx) => {
    const c = loadClan(ctx.params.slug);
    if (ctx.user.clan_id !== c.id) throw forbidden('You are not a member of this clan.');
    if (ctx.user.clan_role === 'leader') {
      throw conflict(c.member_count > 1
        ? 'Transfer leadership to another member before leaving.'
        : 'You are the only member. Delete the clan instead of leaving it.', 'leader_cannot_leave');
    }
    db.prepare('UPDATE users SET clan_id=NULL, clan_role=NULL, updated_at=? WHERE id=?').run(now(), ctx.user.id);
    return { ok: true };
  });

  /* ---------- Requests (co-leader and above) ---------- */
  r.get('/api/clans/:slug/requests', { auth: 'required' }, (ctx) => {
    const c = loadClan(ctx.params.slug);
    requireRank(ctx.user, c, 3);
    const rows = /** @type {Row[]} */ (db.prepare("SELECT * FROM join_requests WHERE clan_id=? AND status='pending' ORDER BY id").all(c.id));
    const items = rows.flatMap((q) => {
      const applicant = /** @type {Row|undefined} */ (db.prepare(`${USER_SQL} WHERE u.id=?`).get(q.user_id));
      return applicant ? [{ id: q.id, message: q.message, createdAt: q.created_at, applicant: serializeUser(applicant),
        meetsRequirements: (applicant.th_level ?? 0) >= c.min_th && (applicant.trophies ?? 0) >= c.min_trophies }] : [];
    });
    return { items };
  });

  /** @param {'accept'|'decline'} action */
  const resolveRequest = (action) => (/** @type {any} */ ctx) => {
    const reqId = Number(ctx.params.id);
    return tx(db, () => {
      const c = loadClan(ctx.params.slug);
      requireRank(ctx.user, c, 3);
      const q = Number.isInteger(reqId) ? /** @type {Row|undefined} */ (db.prepare('SELECT * FROM join_requests WHERE id=? AND clan_id=?').get(reqId, c.id)) : undefined;
      if (!q) throw notFound('Request not found.');
      if (q.status !== 'pending') throw conflict('That request has already been resolved.', 'already_resolved');
      const t = now();
      if (action === 'decline') {
        db.prepare("UPDATE join_requests SET status='declined', resolved_at=?, resolved_by=? WHERE id=?").run(t, ctx.user.id, q.id);
        return { status: 'declined' };
      }
      const applicant = /** @type {Row} */ (db.prepare('SELECT id, clan_id FROM users WHERE id=?').get(q.user_id));
      if (applicant.clan_id) {
        db.prepare("UPDATE join_requests SET status='cancelled', resolved_at=? WHERE id=?").run(t, q.id);
        throw conflict('That player has already joined another clan.', 'applicant_in_clan');
      }
      if (c.member_count >= CLAN_MAX_MEMBERS) throw conflict('Your clan is full.', 'full');
      db.prepare("UPDATE users SET clan_id=?, clan_role='member', updated_at=? WHERE id=?").run(c.id, t, applicant.id);
      db.prepare("UPDATE join_requests SET status='accepted', resolved_at=?, resolved_by=? WHERE id=?").run(t, ctx.user.id, q.id);
      db.prepare("UPDATE join_requests SET status='cancelled', resolved_at=? WHERE user_id=? AND status='pending'").run(t, applicant.id);
      db.prepare('UPDATE users SET recruits = recruits + 1 WHERE id=?').run(ctx.user.id);
      return { status: 'accepted' };
    });
  };
  r.post('/api/clans/:slug/requests/:id/accept', { auth: 'required' }, resolveRequest('accept'));
  r.post('/api/clans/:slug/requests/:id/decline', { auth: 'required' }, resolveRequest('decline'));

  /* ---------- Member management ---------- */
  /** @param {any} ctx @param {Row} clan */
  function targetMember(ctx, clan) {
    const t = getUserByHandle(db, String(ctx.params.handle).toLowerCase());
    if (!t || t.clan_id !== clan.id) throw notFound('That player is not in this clan.');
    return t;
  }

  r.post('/api/clans/:slug/members/:handle/role', { auth: 'required' }, (ctx) => {
    const c = loadClan(ctx.params.slug);
    requireRank(ctx.user, c, 4);
    const { role } = new Validator(ctx.body).oneOf('role', ['member', 'elder', 'coleader'], { label: 'Role' }).done();
    const t = targetMember(ctx, c);
    if (t.id === ctx.user.id) throw forbidden('You cannot change your own role. Transfer leadership instead.');
    db.prepare('UPDATE users SET clan_role=?, updated_at=? WHERE id=?').run(role, now(), t.id);
    return { ok: true, role };
  });

  r.del('/api/clans/:slug/members/:handle', { auth: 'required' }, (ctx) => {
    const c = loadClan(ctx.params.slug);
    requireRank(ctx.user, c, 3);
    const t = targetMember(ctx, c);
    if (t.id === ctx.user.id) throw forbidden('Use “Leave clan” to leave.');
    if (roleRank(ctx.user.clan_role) <= roleRank(t.clan_role)) throw forbidden('You can only remove members ranked below you.');
    db.prepare('UPDATE users SET clan_id=NULL, clan_role=NULL, updated_at=? WHERE id=?').run(now(), t.id);
    return { ok: true };
  });

  r.post('/api/clans/:slug/transfer', { auth: 'required' }, (ctx) => {
    const c = loadClan(ctx.params.slug);
    requireRank(ctx.user, c, 4);
    const handle = typeof ctx.body?.handle === 'string' ? ctx.body.handle.toLowerCase() : '';
    const t = getUserByHandle(db, handle);
    if (!t || t.clan_id !== c.id) throw notFound('That player is not in this clan.');
    if (t.id === ctx.user.id) throw forbidden('You already lead this clan.');
    tx(db, () => {
      db.prepare("UPDATE users SET clan_role='coleader', updated_at=? WHERE id=?").run(now(), ctx.user.id);
      db.prepare("UPDATE users SET clan_role='leader', updated_at=? WHERE id=?").run(now(), t.id);
    });
    return { ok: true };
  });
}

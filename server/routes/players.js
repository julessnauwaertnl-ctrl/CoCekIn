import { LANGUAGES, MAX_TH } from '../../shared/game.js';
import { escapeLike } from '../validate.js';
import { notFound } from '../errors.js';
import { USER_SQL, achievementsFor, getUserByHandle, serializeUser } from '../models.js';
import { intParam, pageParams, pageResult } from '../util.js';

const SORTS = /** @type {Record<string,string>} */ ({
  trophies: 'u.trophies IS NULL, u.trophies DESC, u.id DESC',
  th: 'u.th_level IS NULL, u.th_level DESC, u.trophies DESC, u.id DESC',
  war: 'u.war_stars IS NULL, u.war_stars DESC, u.id DESC',
  newest: 'u.id DESC',
  name: 'u.display_name COLLATE NOCASE ASC',
});

/** @param {import('../router.js').Router} r @param {any} app */
export function registerPlayerRoutes(r, { db }) {
  r.get('/api/players', {}, (ctx) => {
    const q = ctx.query;
    const where = [];
    /** @type {any[]} */ const params = [];
    if (q.q?.trim()) {
      const like = `%${escapeLike(q.q.trim().slice(0, 40))}%`;
      where.push("(u.display_name LIKE ? ESCAPE '\\' OR u.handle LIKE ? ESCAPE '\\' OR u.player_tag LIKE ? ESCAPE '\\')");
      params.push(like, like, like);
    }
    const thMin = intParam(q.thMin, 1, MAX_TH); const thMax = intParam(q.thMax, 1, MAX_TH);
    if (thMin != null) { where.push('u.th_level >= ?'); params.push(thMin); }
    if (thMax != null) { where.push('u.th_level <= ?'); params.push(thMax); }
    if (q.lfc === '1') where.push('u.looking_for_clan = 1 AND u.clan_id IS NULL');
    if (q.clanless === '1') where.push('u.clan_id IS NULL');
    if (q.verified === '1') where.push('u.verified = 1');
    if (q.language && LANGUAGES.some((l) => l.key === q.language)) { where.push('u.language = ?'); params.push(q.language); }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const order = SORTS[q.sort] || SORTS.trophies;
    const p = pageParams(q);
    const total = /** @type {{n:number}} */ (db.prepare(`SELECT COUNT(*) AS n FROM users u ${w}`).get(...params)).n;
    const rows = /** @type {any[]} */ (db.prepare(`${USER_SQL} ${w} ORDER BY ${order} LIMIT ? OFFSET ?`).all(...params, p.size, p.offset));
    return pageResult(rows.map((u) => serializeUser(u)), total, p);
  });

  r.get('/api/players/:handle', {}, (ctx) => {
    const row = getUserByHandle(db, ctx.params.handle.toLowerCase());
    if (!row) throw notFound('No player with that username.');
    return { user: serializeUser(row, { self: ctx.user?.id === row.id }), achievements: achievementsFor(row) };
  });
}

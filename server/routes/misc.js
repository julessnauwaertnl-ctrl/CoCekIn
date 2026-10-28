import { CLAN_MAX_MEMBERS } from '../../shared/game.js';

/** @param {import('../router.js').Router} r @param {any} app */
export function registerMiscRoutes(r, { db, coc }) {
  r.get('/api/meta', {}, () => ({ cocApi: coc.configured, maxMembers: CLAN_MAX_MEMBERS }));

  r.get('/api/stats', {}, () => {
    const one = (/** @type {string} */ sql) => /** @type {Record<string, number>} */ (db.prepare(sql).get());
    const players = one('SELECT COUNT(*) AS n FROM users').n;
    const clans = one('SELECT COUNT(*) AS n FROM clans').n;
    const openClans = one(`SELECT COUNT(*) AS n FROM clans c WHERE c.type='open'
      AND (SELECT COUNT(*) FROM users u WHERE u.clan_id=c.id) < ${CLAN_MAX_MEMBERS}`).n;
    const lookingForClan = one('SELECT COUNT(*) AS n FROM users WHERE looking_for_clan=1 AND clan_id IS NULL').n;
    const demoPlayers = one('SELECT COUNT(*) AS n FROM users WHERE is_demo=1').n;
    const demoClans = one('SELECT COUNT(*) AS n FROM clans WHERE is_demo=1').n;
    return { players, clans, openClans, lookingForClan, demo: { players: demoPlayers, clans: demoClans } };
  });
}

import { CLAN_MAX_MEMBERS, CLAN_ROLES, computeAchievements, rankFor } from '../shared/game.js';

/** @typedef {Record<string, any>} Row */

export const USER_SQL = `SELECT u.*, c.slug AS clan_slug, c.name AS clan_name, c.emblem AS clan_emblem, c.color AS clan_color
  FROM users u LEFT JOIN clans c ON c.id = u.clan_id`;

export const CLAN_SQL = `SELECT c.*, COUNT(u.id) AS member_count, AVG(u.th_level) AS avg_th,
  COALESCE(SUM(u.trophies),0) AS total_trophies, COALESCE(SUM(u.war_stars),0) AS total_war_stars,
  MAX(CASE WHEN u.clan_role='leader' THEN u.handle END) AS leader_handle,
  MAX(CASE WHEN u.clan_role='leader' THEN u.display_name END) AS leader_name
  FROM clans c LEFT JOIN users u ON u.clan_id = c.id`;

/** @param {import('node:sqlite').DatabaseSync} db @param {number} id @returns {Row|undefined} */
export const getUserById = (db, id) => /** @type {Row|undefined} */ (db.prepare(`${USER_SQL} WHERE u.id = ?`).get(id));

/** @param {import('node:sqlite').DatabaseSync} db @param {string} handle @returns {Row|undefined} */
export const getUserByHandle = (db, handle) => /** @type {Row|undefined} */ (db.prepare(`${USER_SQL} WHERE u.handle = ?`).get(handle));

/** @param {import('node:sqlite').DatabaseSync} db @param {string} slug @returns {Row|undefined} */
export const getClanBySlug = (db, slug) => /** @type {Row|undefined} */ (
  db.prepare(`${CLAN_SQL} WHERE c.slug = ? GROUP BY c.id`).get(slug));

/** @param {import('node:sqlite').DatabaseSync} db @param {number} id @returns {Row|undefined} */
export const getClanById = (db, id) => /** @type {Row|undefined} */ (
  db.prepare(`${CLAN_SQL} WHERE c.id = ? GROUP BY c.id`).get(id));

/** @param {Row} u @param {{self?:boolean}} [o] */
export function serializeUser(u, { self = false } = {}) {
  const out = {
    handle: u.handle,
    displayName: u.display_name,
    bio: u.bio,
    playerTag: u.player_tag,
    thLevel: u.th_level,
    trophies: u.trophies,
    bestTrophies: u.best_trophies,
    warStars: u.war_stars,
    donations: u.donations,
    favoriteTroop: u.favorite_troop,
    avatar: u.avatar,
    cover: u.cover,
    language: u.language,
    lookingForClan: !!u.looking_for_clan,
    verified: !!u.verified,
    statsSource: u.stats_source,
    statsSyncedAt: u.stats_synced_at,
    rank: rankFor(u.trophies),
    clan: u.clan_id ? { slug: u.clan_slug, name: u.clan_name, emblem: u.clan_emblem, color: u.clan_color, role: u.clan_role } : null,
    joinedAt: u.created_at,
    isDemo: !!u.is_demo,
  };
  return self ? { ...out, email: u.email } : out;
}

/** @param {Row} u */
export function achievementsFor(u) {
  return computeAchievements({
    thLevel: u.th_level, trophies: u.trophies, warStars: u.war_stars, verified: !!u.verified,
    bio: u.bio, playerTag: u.player_tag, favoriteTroop: u.favorite_troop, clanRole: u.clan_role,
    recruits: u.recruits, accountAgeDays: (Date.now() - Date.parse(u.created_at)) / 86_400_000,
  });
}

/** @param {Row} c */
export function serializeClan(c) {
  return {
    slug: c.slug,
    name: c.name,
    tag: c.tag,
    description: c.description,
    type: c.type,
    minTh: c.min_th,
    minTrophies: c.min_trophies,
    language: c.language,
    warFrequency: c.war_frequency,
    focus: c.focus,
    emblem: c.emblem,
    color: c.color,
    banner: c.banner,
    isDemo: !!c.is_demo,
    createdAt: c.created_at,
    stats: {
      members: c.member_count,
      capacity: CLAN_MAX_MEMBERS,
      avgTh: c.avg_th == null ? null : Math.round(c.avg_th * 10) / 10,
      totalTrophies: c.total_trophies,
      totalWarStars: c.total_war_stars,
    },
    leader: c.leader_handle ? { handle: c.leader_handle, displayName: c.leader_name } : null,
  };
}

/**
 * Can this user join/apply to this clan right now?
 * @param {Row|null} user @param {Row} clan
 * @returns {{allowed:boolean, reason:string|null, message:string|null}}
 */
export function joinEligibility(user, clan) {
  const no = (/** @type {string} */ reason, /** @type {string} */ message) => ({ allowed: false, reason, message });
  if (!user) return no('signed_out', 'Sign in to join this clan.');
  if (user.clan_id === clan.id) return no('member', 'You are already in this clan.');
  if (user.clan_id) return no('in_other_clan', 'Leave your current clan before joining another.');
  if (clan.type === 'closed') return no('closed', 'This clan is not recruiting right now.');
  if (clan.member_count >= CLAN_MAX_MEMBERS) return no('full', 'This clan is full.');
  if (clan.min_th > 1 && user.th_level == null) return no('th_unknown', `Set your Town Hall level on your profile (this clan needs TH ${clan.min_th}+).`);
  if (clan.min_th > (user.th_level ?? 0)) return no('th_too_low', `Requires Town Hall ${clan.min_th}+ (you are TH ${user.th_level}).`);
  if (clan.min_trophies > 0 && user.trophies == null) return no('trophies_unknown', `Set your trophies on your profile (this clan needs ${clan.min_trophies}+).`);
  if (clan.min_trophies > (user.trophies ?? 0)) return no('trophies_too_low', `Requires ${clan.min_trophies} trophies (you have ${user.trophies}).`);
  return { allowed: true, reason: null, message: null };
}

/** @param {string|null|undefined} role */
export const roleRank = (role) => CLAN_ROLES.find((r) => r.key === role)?.rank ?? 0;

// Shared game constants + pure helpers. Imported by BOTH the server and the browser.
// CoCekIn is an unofficial fan project. All art is original; no Supercell assets are used.

export const MAX_TH = 18;
export const CLAN_MAX_MEMBERS = 50;

/** @typedef {{key:string,label:string}} Opt */

export const CLAN_TYPES = /** @type {const} */ ([
  { key: 'open', label: 'Open', hint: 'Anyone who meets the requirements can join instantly' },
  { key: 'invite', label: 'Invite only', hint: 'Players apply and a leader approves' },
  { key: 'closed', label: 'Closed', hint: 'Not recruiting right now' },
]);

export const WAR_FREQUENCIES = [
  { key: 'always', label: 'Always at war' },
  { key: 'twice_week', label: 'Twice a week' },
  { key: 'once_week', label: 'Once a week' },
  { key: 'rarely', label: 'Rarely' },
  { key: 'never', label: 'Never' },
];

export const FOCUSES = [
  { key: 'war', label: 'Clan wars' },
  { key: 'cwl', label: 'War leagues' },
  { key: 'farming', label: 'Farming & upgrades' },
  { key: 'push', label: 'Trophy pushing' },
  { key: 'casual', label: 'Casual & social' },
];

export const CLAN_ROLES = [
  { key: 'member', label: 'Member', rank: 1 },
  { key: 'elder', label: 'Elder', rank: 2 },
  { key: 'coleader', label: 'Co-leader', rank: 3 },
  { key: 'leader', label: 'Leader', rank: 4 },
];

export const LANGUAGES = [
  { key: 'en', label: 'English' }, { key: 'nl', label: 'Nederlands' }, { key: 'fr', label: 'Français' },
  { key: 'de', label: 'Deutsch' }, { key: 'es', label: 'Español' }, { key: 'pt', label: 'Português' },
  { key: 'it', label: 'Italiano' }, { key: 'tr', label: 'Türkçe' }, { key: 'pl', label: 'Polski' },
  { key: 'ru', label: 'Русский' }, { key: 'ar', label: 'العربية' }, { key: 'id', label: 'Bahasa Indonesia' },
  { key: 'ja', label: '日本語' }, { key: 'ko', label: '한국어' }, { key: 'zh', label: '中文' },
];

export const TROOPS = [
  'Barbarian', 'Archer', 'Giant', 'Goblin', 'Wall Breaker', 'Balloon', 'Wizard', 'Healer', 'Dragon',
  'P.E.K.K.A', 'Baby Dragon', 'Miner', 'Electro Dragon', 'Yeti', 'Dragon Rider', 'Root Rider', 'Minion',
  'Hog Rider', 'Valkyrie', 'Golem', 'Witch', 'Lava Hound', 'Bowler', 'Ice Golem', 'Barbarian King',
  'Archer Queen', 'Grand Warden', 'Royal Champion', 'Minion Prince', 'Dragon Duke',
];

/** Emblem glyph + colour palette shared by player avatars and clan badges. */
export const EMBLEMS = ['crown', 'sword', 'shield', 'flame', 'bolt', 'skull', 'gem', 'wing', 'tower', 'star'];

export const PALETTE = {
  gold: ['#ffd45a', '#d98a0b'],
  ruby: ['#ff6b6b', '#a4161a'],
  elixir: ['#e879f9', '#7e22ce'],
  sky: ['#7dd3fc', '#1d6fb8'],
  emerald: ['#6ee7a0', '#0f7a3f'],
  ember: ['#ffa14a', '#c2410c'],
  frost: ['#d9f1ff', '#5b8fb9'],
  shadow: ['#9ca3b8', '#3b3f56'],
};

export const AVATARS = EMBLEMS.flatMap((e) => ['gold', 'ruby', 'elixir', 'sky', 'emerald', 'ember']
  .map((c) => `${e}-${c}`));

export const COVERS = [
  { key: 'sunset-keep', label: 'Sunset Keep' },
  { key: 'dark-forest', label: 'Dark Forest' },
  { key: 'lava-fields', label: 'Lava Fields' },
  { key: 'frozen-peaks', label: 'Frozen Peaks' },
  { key: 'golden-dunes', label: 'Golden Dunes' },
  { key: 'night-siege', label: 'Night Siege' },
];

/** CoCekIn rank tiers, derived from trophies. Our own scale, not the in-game league names. */
export const RANKS = [
  { key: 'bronze', label: 'Bronze', min: 0 },
  { key: 'silver', label: 'Silver', min: 400 },
  { key: 'gold', label: 'Gold', min: 1000 },
  { key: 'crystal', label: 'Crystal', min: 1600 },
  { key: 'master', label: 'Master', min: 2200 },
  { key: 'champion', label: 'Champion', min: 3000 },
  { key: 'titan', label: 'Titan', min: 4000 },
  { key: 'legend', label: 'Legend', min: 5000 },
];

/** @param {number|null|undefined} trophies */
export function rankFor(trophies) {
  if (trophies == null) return null;
  let found = RANKS[0];
  for (const r of RANKS) if (trophies >= r.min) found = r;
  return found;
}

export const RESERVED_HANDLES = new Set([
  'admin', 'administrator', 'api', 'me', 'root', 'support', 'system', 'cocekin', 'moderator', 'null', 'undefined',
]);
export const RESERVED_SLUGS = new Set(['new', 'api', 'edit', 'search']);

/**
 * Normalise a Clash of Clans tag. Returns '#XXXX' or null when invalid.
 * @param {unknown} input
 */
export function normalizeTag(input) {
  if (typeof input !== 'string') return null;
  let t = input.trim().toUpperCase().replace(/O/g, '0');
  if (!t.startsWith('#')) t = `#${t}`;
  return /^#[0289PYLQGRJCUV]{3,12}$/.test(t) ? t : null;
}

/**
 * @typedef {{ thLevel:number|null, trophies:number|null, warStars:number|null, verified:boolean,
 *   bio:string, playerTag:string|null, favoriteTroop:string|null, clanRole:string|null, recruits:number,
 *   accountAgeDays:number }} AchievementCtx
 */

/** @type {{id:string,title:string,description:string,icon:string,tier:'bronze'|'silver'|'gold',progress:(c:AchievementCtx)=>{value:number,target:number}}[]} */
export const ACHIEVEMENTS = [
  { id: 'clan-mate', title: 'Clan Mate', description: 'Join a clan.', icon: 'shield', tier: 'bronze',
    progress: (c) => ({ value: c.clanRole ? 1 : 0, target: 1 }) },
  { id: 'chieftain', title: 'Chieftain', description: 'Lead a clan.', icon: 'crown', tier: 'gold',
    progress: (c) => ({ value: c.clanRole === 'leader' ? 1 : 0, target: 1 }) },
  { id: 'recruiter', title: 'Recruiter', description: 'Accept 5 join requests into your clan.', icon: 'star', tier: 'silver',
    progress: (c) => ({ value: Math.min(c.recruits, 5), target: 5 }) },
  { id: 'th10', title: 'Fortified', description: 'Reach Town Hall 10.', icon: 'tower', tier: 'bronze',
    progress: (c) => ({ value: Math.min(c.thLevel ?? 0, 10), target: 10 }) },
  { id: 'th14', title: 'Warlord', description: 'Reach Town Hall 14.', icon: 'tower', tier: 'silver',
    progress: (c) => ({ value: Math.min(c.thLevel ?? 0, 14), target: 14 }) },
  { id: 'thmax', title: 'Maxed Out', description: `Reach Town Hall ${MAX_TH}.`, icon: 'tower', tier: 'gold',
    progress: (c) => ({ value: Math.min(c.thLevel ?? 0, MAX_TH), target: MAX_TH }) },
  { id: 'trophy1k', title: 'Rising Raider', description: 'Hold 1,000 trophies.', icon: 'bolt', tier: 'bronze',
    progress: (c) => ({ value: Math.min(c.trophies ?? 0, 1000), target: 1000 }) },
  { id: 'trophy3k', title: 'Trophy Hunter', description: 'Hold 3,000 trophies.', icon: 'bolt', tier: 'silver',
    progress: (c) => ({ value: Math.min(c.trophies ?? 0, 3000), target: 3000 }) },
  { id: 'trophy5k', title: 'Legend Hunter', description: 'Hold 5,000 trophies.', icon: 'bolt', tier: 'gold',
    progress: (c) => ({ value: Math.min(c.trophies ?? 0, 5000), target: 5000 }) },
  { id: 'war100', title: 'War Hero', description: 'Earn 100 war stars.', icon: 'sword', tier: 'bronze',
    progress: (c) => ({ value: Math.min(c.warStars ?? 0, 100), target: 100 }) },
  { id: 'war500', title: 'Warmonger', description: 'Earn 500 war stars.', icon: 'sword', tier: 'gold',
    progress: (c) => ({ value: Math.min(c.warStars ?? 0, 500), target: 500 }) },
  { id: 'verified', title: 'Verified Chief', description: 'Verify your in-game account with an official API token.', icon: 'gem', tier: 'silver',
    progress: (c) => ({ value: c.verified ? 1 : 0, target: 1 }) },
  { id: 'complete', title: 'Fully Equipped', description: 'Add a bio, a player tag and a favourite unit.', icon: 'flame', tier: 'bronze',
    progress: (c) => ({ value: (c.bio.length >= 10 ? 1 : 0) + (c.playerTag ? 1 : 0) + (c.favoriteTroop ? 1 : 0), target: 3 }) },
  { id: 'seasoned', title: 'Seasoned', description: 'Be a CoCekIn member for 30 days.', icon: 'wing', tier: 'bronze',
    progress: (c) => ({ value: Math.min(Math.floor(c.accountAgeDays), 30), target: 30 }) },
];

/** @param {AchievementCtx} ctx */
export function computeAchievements(ctx) {
  return ACHIEVEMENTS.map((a) => {
    const { value, target } = a.progress(ctx);
    return { id: a.id, title: a.title, description: a.description, icon: a.icon, tier: a.tier, value, target, earned: value >= target };
  });
}

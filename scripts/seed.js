// Optional demo content so a fresh deployment does not look empty while you invite real players.
// Everything created here is flagged is_demo=1, shows a "Demo" badge in the UI, and cannot be logged into.
//   npm run seed            add demo players and clans (skips ones that already exist)
//   npm run seed -- --reset remove all demo players and clans (real accounts are untouched)
import crypto from 'node:crypto';
import { loadConfig } from '../server/config.js';
import { openDb, now, tx } from '../server/db.js';
import { hashPassword } from '../server/auth.js';

const config = loadConfig();
const db = openDb(config.dbPath);

if (process.argv.includes('--reset')) {
  tx(db, () => {
    db.prepare('UPDATE users SET clan_id=NULL, clan_role=NULL WHERE clan_id IN (SELECT id FROM clans WHERE is_demo=1)').run();
    db.prepare('DELETE FROM clans WHERE is_demo=1').run();
    db.prepare('DELETE FROM users WHERE is_demo=1').run();
  });
  console.log('Removed all demo players and clans.');
  process.exit(0);
}

const unusable = await hashPassword(crypto.randomBytes(32).toString('hex')); // random, never disclosed: demo accounts cannot sign in
const t = now();

/** @type {[string,string,string,number,number,number,string,string,string,string,boolean,string][]} handle, name, bio, th, trophies, warStars, troop, avatar, cover, lang, lfc, clanKey|'' */
const players = [
  ['ironfist', 'Ironfist', 'Wall-breaker enjoyer. Never misses a war attack.', 16, 5480, 812, 'Barbarian King', 'sword-ruby', 'lava-fields', 'en', false, 'wolves'],
  ['mira_stormcaller', 'Mira Stormcaller', 'Lightning-spell specialist. CWL grinder.', 15, 4720, 604, 'Electro Dragon', 'bolt-sky', 'frozen-peaks', 'en', false, 'wolves'],
  ['pekka_pete', 'PEKKA Pete', 'Mass PEKKA smash, every single time.', 14, 4010, 377, 'P.E.K.K.A', 'shield-elixir', 'dark-forest', 'en', false, 'wolves'],
  ['luna_nl', 'Luna', 'Rustig, actief en altijd in voor een oorlog.', 13, 3380, 241, 'Healer', 'star-gold', 'night-siege', 'nl', false, 'poldervorsten'],
  ['bram_poldervorst', 'Bram', 'Leider van de Poldervorsten. Farmen en oorlogen!', 14, 3920, 402, 'Golem', 'crown-gold', 'golden-dunes', 'nl', false, 'poldervorsten'],
  ['sander_b', 'Sander B.', 'Gewoon relaxed spelen, elke dag inloggen.', 11, 2410, 120, 'Hog Rider', 'flame-ember', 'sunset-keep', 'nl', false, 'poldervorsten'],
  ['capitaine_zoe', 'Capitaine Zoé', 'On attaque en équipe, on gagne en équipe.', 15, 4300, 520, 'Archer Queen', 'crown-emerald', 'sunset-keep', 'fr', false, 'legion'],
  ['lucas_fr', 'Lucas', 'Joueur régulier, toujours prêt pour la guerre.', 12, 3050, 198, 'Witch', 'skull-shadow', 'dark-forest', 'fr', false, 'legion'],
  ['sven_hd', 'Sven', 'Bauen, farmen, entspannt bleiben.', 9, 1850, 64, 'Valkyrie', 'tower-sky', 'frozen-peaks', 'de', false, 'farmers'],
  ['hannah_farm', 'Hannah', 'Farm-Queen. Dunkles Elixier ist mein Hobby.', 10, 2100, 88, 'Miner', 'gem-emerald', 'golden-dunes', 'de', false, 'farmers'],
  ['kodiak', 'Kodiak', 'Trophy pusher, legend league or bust.', 17, 6120, 930, 'Dragon Duke', 'wing-elixir', 'night-siege', 'en', false, ''],
  ['tessa_t', 'Tessa', 'New to the game, learning fast!', 7, 1120, 22, 'Wizard', 'star-sky', 'sunset-keep', 'en', true, ''],
  ['marcus_war', 'Marcus', 'TH13, looking for a serious war clan.', 13, 3500, 290, 'Yeti', 'bolt-ruby', 'lava-fields', 'en', true, ''],
  ['alina_nl', 'Alina', 'Zoek een gezellige Nederlandstalige clan.', 10, 2250, 75, 'Baby Dragon', 'flame-gold', 'dark-forest', 'nl', true, ''],
  ['diego_es', 'Diego', 'Busco un clan activo en español para guerras.', 14, 3880, 360, 'Lava Hound', 'skull-ember', 'night-siege', 'es', true, ''],
  ['jonas_c', 'Jonas', 'Casual player, donations are my love language.', 8, 1500, 40, 'Giant', 'shield-gold', 'golden-dunes', 'en', true, ''],
];
/** @type {[string,string,string,string,number,number,string,string,string,string,string,string,string][]} key, name, description, type, minTh, minTrophies, lang, war, focus, emblem, color, banner, leaderHandle */
const clans = [
  ['wolves', 'Frostfang Wolves', 'Competitive war clan. Two wars a week, strict attack discipline, friendly banter.', 'invite', 13, 3000, 'en', 'always', 'war', 'sword', 'sky', 'frozen-peaks', 'ironfist'],
  ['poldervorsten', 'Poldervorsten', 'Nederlandstalige clan voor actieve spelers. Oorlog, CWL en veel gezelligheid.', 'open', 9, 1500, 'nl', 'twice_week', 'cwl', 'crown', 'gold', 'golden-dunes', 'bram_poldervorst'],
  ['legion', 'Légion Dorée', 'Clan francophone sérieux mais détendu. Guerres régulières et ligue des clans.', 'invite', 11, 2500, 'fr', 'twice_week', 'war', 'shield', 'emerald', 'sunset-keep', 'capitaine_zoe'],
  ['farmers', 'Gemütliche Farmer', 'Entspanntes Farming und gemeinsames Upgraden. Keine Kriegspflicht.', 'open', 1, 0, 'de', 'rarely', 'farming', 'gem', 'emerald', 'dark-forest', 'hannah_farm'],
];
const roleFor = (/** @type {number} */ i, /** @type {boolean} */ isLeader) => (isLeader ? 'leader' : i === 1 ? 'coleader' : i === 2 ? 'elder' : 'member');

tx(db, () => {
  let addedClans = 0; let addedPlayers = 0;
  /** @type {Record<string, number>} */ const clanIds = {};
  for (const [key, name, description, type, minTh, minTrophies, language, war, focus, emblem, color, banner] of clans) {
    const slug = name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const existing = /** @type {{id:number}|undefined} */ (db.prepare('SELECT id FROM clans WHERE slug=?').get(slug));
    if (existing) { clanIds[key] = existing.id; continue; }
    const r = db.prepare(`INSERT INTO clans(slug,name,description,type,min_th,min_trophies,language,war_frequency,focus,emblem,color,banner,is_demo,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)`).run(slug, name, description, type, minTh, minTrophies, language, war, focus, emblem, color, banner, t, t);
    clanIds[key] = Number(r.lastInsertRowid); addedClans++;
  }
  /** @type {Record<string, number>} */ const seen = {};
  for (const [handle, displayName, bio, th, trophies, warStars, troop, avatar, cover, lang, lfc, clanKey] of players) {
    if (db.prepare('SELECT 1 FROM users WHERE handle=?').get(handle)) continue;
    const clan = clanKey ? clans.find((c) => c[0] === clanKey) : undefined;
    const isLeader = !!clan && clan[12] === handle;
    const idx = clanKey ? (seen[clanKey] = (seen[clanKey] ?? 0) + 1) : 0;
    db.prepare(`INSERT INTO users(email,password_hash,handle,display_name,bio,th_level,trophies,best_trophies,war_stars,donations,favorite_troop,avatar,cover,language,looking_for_clan,clan_id,clan_role,is_demo,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)`).run(`demo+${handle}@cocekin.invalid`, unusable, handle, displayName, bio, th, trophies, trophies + 150, warStars, warStars * 7,
      troop, avatar, cover, lang, Number(lfc), clanKey ? clanIds[clanKey] : null, clanKey ? roleFor(idx, isLeader) : null, t, t);
    addedPlayers++;
  }
  console.log(`Added ${addedPlayers} demo players and ${addedClans} demo clans (flagged "Demo" in the UI).`);
});

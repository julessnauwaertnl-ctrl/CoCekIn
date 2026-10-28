import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const SCHEMA_V1 = `
CREATE TABLE clans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  tag TEXT,
  description TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'open' CHECK (type IN ('open','invite','closed')),
  min_th INTEGER NOT NULL DEFAULT 1,
  min_trophies INTEGER NOT NULL DEFAULT 0,
  language TEXT NOT NULL DEFAULT 'en',
  war_frequency TEXT NOT NULL DEFAULT 'twice_week',
  focus TEXT NOT NULL DEFAULT 'casual',
  emblem TEXT NOT NULL DEFAULT 'shield',
  color TEXT NOT NULL DEFAULT 'gold',
  banner TEXT NOT NULL DEFAULT 'sunset-keep',
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  handle TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  bio TEXT NOT NULL DEFAULT '',
  player_tag TEXT,
  th_level INTEGER,
  trophies INTEGER,
  best_trophies INTEGER,
  war_stars INTEGER,
  donations INTEGER,
  favorite_troop TEXT,
  avatar TEXT NOT NULL DEFAULT 'crown-gold',
  cover TEXT NOT NULL DEFAULT 'sunset-keep',
  language TEXT NOT NULL DEFAULT 'en',
  looking_for_clan INTEGER NOT NULL DEFAULT 0,
  verified INTEGER NOT NULL DEFAULT 0,
  stats_source TEXT NOT NULL DEFAULT 'self' CHECK (stats_source IN ('self','api')),
  stats_synced_at TEXT,
  clan_id INTEGER REFERENCES clans(id) ON DELETE SET NULL,
  clan_role TEXT CHECK (clan_role IN ('member','elder','coleader','leader')),
  recruits INTEGER NOT NULL DEFAULT 0,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_users_clan ON users(clan_id);
CREATE INDEX idx_users_trophies ON users(trophies DESC);
CREATE UNIQUE INDEX idx_users_verified_tag ON users(player_tag) WHERE verified = 1;
CREATE UNIQUE INDEX idx_clan_one_leader ON users(clan_id) WHERE clan_role = 'leader';
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  user_agent TEXT
);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE TABLE join_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  clan_id INTEGER NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','cancelled')),
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  resolved_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX idx_one_pending ON join_requests(clan_id, user_id) WHERE status = 'pending';
CREATE INDEX idx_requests_user ON join_requests(user_id);
`;

const MIGRATIONS = [SCHEMA_V1];

/** @param {string} file */
export function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;');
  const row = /** @type {{user_version:number}} */ (db.prepare('PRAGMA user_version').get());
  for (let v = row.user_version; v < MIGRATIONS.length; v++) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  }
  return db;
}

/**
 * Run fn inside an immediate transaction (serialises writers, so check-then-write logic is race free).
 * @template T @param {DatabaseSync} db @param {() => T} fn @returns {T}
 */
export function tx(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
}

export const now = () => new Date().toISOString();

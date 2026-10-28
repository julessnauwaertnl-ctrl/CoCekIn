import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { now } from './db.js';

const scrypt = /** @type {(pw:string, salt:Buffer, len:number, opts:object)=>Promise<Buffer>} */ (promisify(crypto.scrypt));
const PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

/** @param {string} password */
export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, 64, PARAMS);
  return `scrypt$${PARAMS.N}$${salt.toString('base64')}$${key.toString('base64')}`;
}

/** @param {string} password @param {string} stored */
export async function verifyPassword(password, stored) {
  const [alg, n, saltB64, keyB64] = stored.split('$');
  if (alg !== 'scrypt') return false;
  const expected = Buffer.from(keyB64, 'base64');
  const key = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length, { ...PARAMS, N: Number(n) });
  return key.length === expected.length && crypto.timingSafeEqual(key, expected);
}

// Pre-computed so login timing does not reveal whether an email exists.
export const DUMMY_HASH = await hashPassword('cocekin-dummy-password');

const sha = (/** @type {string} */ s) => crypto.createHash('sha256').update(s).digest('hex');

/**
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {number} userId @param {number} days @param {string} [ua]
 */
export function createSession(db, userId, days, ua = '') {
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + days * 86_400_000).toISOString();
  db.prepare('INSERT INTO sessions(token_hash,user_id,created_at,expires_at,user_agent) VALUES(?,?,?,?,?)')
    .run(sha(token), userId, now(), expires, ua.slice(0, 200));
  return { token, expires };
}

/** @param {import('node:sqlite').DatabaseSync} db @param {string} token @param {number} days */
export function findSession(db, token, days) {
  const row = /** @type {{user_id:number,expires_at:string}|undefined} */ (
    db.prepare('SELECT user_id, expires_at FROM sessions WHERE token_hash=?').get(sha(token)));
  if (!row) return null;
  if (row.expires_at < now()) { destroySession(db, token); return null; }
  // Sliding expiry, written at most about once a day.
  const target = new Date(Date.now() + days * 86_400_000).toISOString();
  if (Date.parse(target) - Date.parse(row.expires_at) > 86_400_000) {
    db.prepare('UPDATE sessions SET expires_at=? WHERE token_hash=?').run(target, sha(token));
  }
  return row.user_id;
}

/** @param {import('node:sqlite').DatabaseSync} db @param {string} token */
export function destroySession(db, token) { db.prepare('DELETE FROM sessions WHERE token_hash=?').run(sha(token)); }

/** @param {import('node:sqlite').DatabaseSync} db @param {number} userId @param {string} [exceptToken] */
export function destroyOtherSessions(db, userId, exceptToken) {
  if (exceptToken) db.prepare('DELETE FROM sessions WHERE user_id=? AND token_hash<>?').run(userId, sha(exceptToken));
  else db.prepare('DELETE FROM sessions WHERE user_id=?').run(userId);
}

/** @param {string|undefined} header */
export function parseCookies(header) {
  /** @type {Record<string,string>} */
  const out = {};
  for (const part of (header || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 1) continue;
    const k = part.slice(0, i).trim();
    try { out[k] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* ignore malformed */ }
  }
  return out;
}

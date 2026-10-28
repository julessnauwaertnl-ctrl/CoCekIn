import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** @param {string|undefined} v @param {number} d */
const int = (v, d) => { const n = Number.parseInt(v ?? '', 10); return Number.isFinite(n) ? n : d; };
/** @param {string|undefined} v */
const list = (v) => (v ?? '').split(',').map((s) => s.trim()).filter(Boolean);

/**
 * @param {Record<string,string|undefined>} [env]
 * @param {Record<string, any>} [overrides]
 */
export function loadConfig(env = process.env, overrides = {}) {
  const isProd = env.NODE_ENV === 'production';
  const dist = path.join(ROOT, 'dist', 'public');
  const publicDir = env.PUBLIC_DIR
    || (isProd && fs.existsSync(path.join(dist, 'index.html')) ? dist : path.join(ROOT, 'public'));
  const base = {
    isProd,
    port: int(env.PORT, 3000),
    host: env.HOST || '0.0.0.0',
    dbPath: env.DATABASE_PATH || path.join(ROOT, 'data', 'cocekin.db'),
    publicDir,
    cookieName: 'cocekin_sid',
    cookieSecure: env.COOKIE_SECURE ? env.COOKIE_SECURE === 'true' : isProd,
    trustProxy: env.TRUST_PROXY === 'true',
    allowedOrigins: list(env.ALLOWED_ORIGINS),
    siteUrl: (env.SITE_URL || '').replace(/\/$/, ''),
    cocToken: env.COC_API_TOKEN || '',
    cocBase: env.COC_API_BASE || 'https://api.clashofclans.com/v1',
    sessionDays: 30,
    maxBodyBytes: 32 * 1024,
    limits: {
      login: { max: 10, windowMs: 15 * 60_000 },
      register: { max: 8, windowMs: 60 * 60_000 },
      write: { max: 120, windowMs: 60_000 },
      read: { max: 600, windowMs: 60_000 },
    },
  };
  return /** @type {typeof base} */ (Object.assign(base, overrides));
}

import { createApp } from '../server/app.js';

// Captured at import time so tests that replace global fetch (browser simulation) don't affect API test clients.
const nativeFetch = globalThis.fetch;

/**
 * Spin up an in-memory app on an ephemeral port.
 * @param {Record<string, any>} [overrides] @param {{fetchImpl?: typeof fetch}} [deps]
 */
export async function startApp(overrides = {}, deps = {}) {
  const app = createApp({
    dbPath: ':memory:',
    limits: { login: { max: 1000, windowMs: 60_000 }, register: { max: 1000, windowMs: 60_000 }, write: { max: 100000, windowMs: 60_000 }, read: { max: 100000, windowMs: 60_000 } },
    ...overrides,
  }, deps);
  await new Promise((res) => app.server.listen(0, '127.0.0.1', () => res(undefined)));
  const addr = /** @type {import('node:net').AddressInfo} */ (app.server.address());
  const base = `http://127.0.0.1:${addr.port}`;
  return { ...app, base };
}

/** Minimal API client with a cookie jar. @param {string} base */
export function client(base) {
  let cookie = '';
  /** @param {string} method @param {string} path @param {any} [body] @param {Record<string,string>} [headers] */
  async function call(method, path, body, headers = {}) {
    const h = { ...headers };
    if (method !== 'GET') h['Content-Type'] = h['Content-Type'] ?? 'application/json';
    if (cookie) h.Cookie = cookie;
    const res = await nativeFetch(base + path, { method, headers: h, body: method === 'GET' ? undefined : (body === undefined ? '{}' : (typeof body === 'string' ? body : JSON.stringify(body))) });
    const set = res.headers.getSetCookie?.() ?? [];
    for (const c of set) { const pair = c.split(';')[0]; if (pair.endsWith('=')) cookie = ''; else cookie = pair; }
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: res.status, json, text, headers: res.headers, setCookie: set };
  }
  return {
    /** @param {string} p */ get: (p) => call('GET', p),
    post: (/** @type {string} */ p, /** @type {any} */ b = undefined) => call('POST', p, b),
    patch: (/** @type {string} */ p, /** @type {any} */ b = undefined) => call('PATCH', p, b),
    del: (/** @type {string} */ p, /** @type {any} */ b = undefined) => call('DELETE', p, b),
    raw: call,
  };
}

let n = 0;
/** Register a fresh user and return a signed-in client. */
export async function signup(/** @type {string} */ base, /** @type {Record<string,any>} */ extra = {}) {
  const c = client(base);
  n += 1;
  const handle = extra.handle ?? `player${n}`;
  const res = await c.post('/api/auth/register', { email: `${handle}@example.com`, handle, displayName: extra.displayName ?? `Player ${n}`, password: 'correct-horse-battery' });
  if (res.status !== 201) throw new Error(`signup failed: ${res.text}`);
  if (extra.profile) { const p = await c.patch('/api/me', extra.profile); if (p.status !== 200) throw new Error(`profile failed: ${p.text}`); }
  return { c, handle };
}

export const clanBody = (/** @type {Record<string,any>} */ o = {}) => ({
  name: 'Iron Wolves', description: 'We war hard.', type: 'open', minTh: 1, minTrophies: 0, language: 'en',
  warFrequency: 'always', focus: 'war', emblem: 'sword', color: 'gold', banner: 'dark-forest', ...o,
});

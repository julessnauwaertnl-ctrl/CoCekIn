import http from 'node:http';
import { loadConfig } from './config.js';
import { openDb } from './db.js';
import { Router } from './router.js';
import { HttpError, forbidden, unauthorized } from './errors.js';
import { RateLimiter } from './ratelimit.js';
import { createCocClient } from './coc.js';
import { findSession, parseCookies } from './auth.js';
import { getUserById } from './models.js';
import { createStatic } from './static.js';
import { registerAccountRoutes } from './routes/account.js';
import { registerPlayerRoutes } from './routes/players.js';
import { registerClanRoutes } from './routes/clans.js';
import { registerMiscRoutes } from './routes/misc.js';

/**
 * @param {Record<string, any>} [overrides]
 * @param {{ fetchImpl?: typeof fetch }} [deps]
 */
export function createApp(overrides = {}, deps = {}) {
  const config = loadConfig(process.env, overrides);
  const db = openDb(config.dbPath);
  const limiter = new RateLimiter();
  const coc = createCocClient({ token: config.cocToken, base: config.cocBase, fetchImpl: deps.fetchImpl });
  const router = new Router();
  const app = { db, config, limiter, coc, router };

  registerMiscRoutes(router, app);
  registerAccountRoutes(router, app);
  registerPlayerRoutes(router, app);
  registerClanRoutes(router, app);

  const serveStatic = createStatic({ dir: config.publicDir, siteUrl: config.siteUrl });

  /** @param {http.IncomingMessage} req */
  const clientIp = (req) => {
    if (config.trustProxy) {
      const xff = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
      if (xff) return xff;
    }
    return req.socket.remoteAddress || 'unknown';
  };

  /** @param {http.ServerResponse} res */
  function securityHeaders(res) {
    res.setHeader('Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; "
      + "object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    if (config.cookieSecure) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  /** @param {http.IncomingMessage} req */
  function checkOrigin(req) {
    const origin = req.headers.origin;
    const site = req.headers['sec-fetch-site'];
    if (origin) {
      let host = '';
      try { host = new URL(origin).host; } catch { throw forbidden('Invalid origin.', 'bad_origin'); }
      const own = [req.headers.host, config.trustProxy ? String(req.headers['x-forwarded-host'] || '') : ''];
      if (!own.includes(host) && !config.allowedOrigins.includes(origin)) throw forbidden('Cross-site requests are not allowed.', 'bad_origin');
    } else if (site && !['same-origin', 'none'].includes(String(site))) {
      throw forbidden('Cross-site requests are not allowed.', 'bad_origin');
    }
  }

  /** @param {http.IncomingMessage} req @param {number} max */
  function readBody(req, max) {
    return new Promise((resolve, reject) => {
      /** @type {Buffer[]} */
      const chunks = [];
      let size = 0;
      let rejected = false;
      if (Number(req.headers['content-length'] || 0) > max) { rejected = true; reject(new HttpError(413, 'Request body is too large.', 'too_large')); }
      req.on('data', (c) => {
        if (rejected) return; // drain and discard; the response closes the connection
        size += c.length;
        if (size > max) { rejected = true; reject(new HttpError(413, 'Request body is too large.', 'too_large')); return; }
        chunks.push(c);
      });
      req.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        if (rejected) return;
        if (!text.trim()) { resolve({}); return; }
        try { resolve(JSON.parse(text)); } catch { reject(new HttpError(400, 'Request body is not valid JSON.', 'bad_json')); }
      });
      req.on('error', reject);
    });
  }

  /** @param {http.ServerResponse} res @param {number} status @param {unknown} body @param {string[]} [cookies] */
  function sendJson(res, status, body, cookies = []) {
    const data = JSON.stringify(body);
    if (cookies.length) res.setHeader('Set-Cookie', cookies);
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(data), 'Cache-Control': 'no-store' });
    res.end(data);
  }

  /** @param {http.IncomingMessage} req @param {http.ServerResponse} res @param {URL} url */
  async function handleApi(req, res, url) {
    const method = req.method || 'GET';
    const ip = clientIp(req);
    /** @type {string[]} */
    const cookies = [];
    try {
      const isWrite = !['GET', 'HEAD'].includes(method);
      const lim = isWrite ? config.limits.write : config.limits.read;
      const rl = limiter.hit(`${isWrite ? 'w' : 'r'}:${ip}`, lim.max, lim.windowMs);
      if (!rl.ok) { res.setHeader('Retry-After', String(rl.retryAfter)); throw new HttpError(429, 'Too many requests. Please slow down.', 'rate_limited'); }

      if (isWrite) {
        if (!['POST', 'PATCH', 'DELETE'].includes(method)) throw new HttpError(405, 'Method not allowed.', 'method_not_allowed');
        checkOrigin(req);
        if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
          throw new HttpError(415, 'Content-Type must be application/json.', 'unsupported_media_type');
        }
      }
      const { route, params, methodNotAllowed } = router.match(method, url.pathname);
      if (!route) throw methodNotAllowed ? new HttpError(405, 'Method not allowed.', 'method_not_allowed') : new HttpError(404, 'API route not found.', 'not_found');

      const token = parseCookies(req.headers.cookie)[config.cookieName] || '';
      const userId = token ? findSession(db, token, config.sessionDays) : null;
      const user = userId ? getUserById(db, userId) ?? null : null;
      if (route.opts.auth === 'required' && !user) throw unauthorized();

      const ctx = {
        req, res, url, params, ip, user, token, status: 200, cookies, app,
        query: Object.fromEntries(url.searchParams),
        body: isWrite ? await readBody(req, config.maxBodyBytes) : {},
      };
      const result = await route.handler(ctx);
      sendJson(res, ctx.status, result ?? { ok: true }, ctx.cookies);
    } catch (err) {
      if (err instanceof HttpError) {
        if (err.status === 413) res.setHeader('Connection', 'close');
        sendJson(res, err.status, { error: { message: err.message, code: err.code, fields: err.fields } }, cookies);
      } else {
        console.error('[cocekin] unhandled error:', err);
        sendJson(res, 500, { error: { message: 'Something went wrong on our side. Please try again.', code: 'internal' } });
      }
    }
  }

  const server = http.createServer((req, res) => {
    securityHeaders(res);
    let url;
    try { url = new URL(req.url || '/', 'http://localhost'); } catch { res.writeHead(400); res.end(); return; }
    if (url.pathname === '/health') {
      try { db.prepare('SELECT 1').get(); sendJson(res, 200, { status: 'ok' }); } catch { sendJson(res, 503, { status: 'down' }); }
      return;
    }
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) { handleApi(req, res, url); return; }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return; }
    serveStatic(req, res, url.pathname);
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 15_000;
  server.keepAliveTimeout = 65_000;

  return {
    server, db, config, coc,
    close() { limiter.close(); server.close(); server.closeAllConnections?.(); try { db.close(); } catch { /* already closed */ } },
  };
}

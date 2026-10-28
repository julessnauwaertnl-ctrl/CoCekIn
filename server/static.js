import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { ROOT } from './config.js';

const TYPES = /** @type {Record<string,string>} */ ({
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg',
  '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8', '.woff2': 'font/woff2',
});
const COMPRESSIBLE = new Set(['.html', '.css', '.js', '.json', '.svg', '.txt', '.xml', '.webmanifest']);
const SPA_ROOTS = new Set(['', 'clans', 'players', 'u', 'login', 'register', 'settings', 'dashboard', 'privacy']);

/** @param {string} dir @returns {string[]} */
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}

/** @param {{dir:string, siteUrl:string}} opts */
export function createStatic({ dir, siteUrl }) {
  /** @typedef {{raw:Buffer,gz?:Buffer,br?:Buffer,type:string,etag:string,cache:string}} Entry */
  /** @type {Map<string,Entry>} */
  const files = new Map();
  /** @type {{abs:string, rel:string}[]} */
  const sources = walk(dir).map((abs) => ({ abs, rel: `/${path.relative(dir, abs).split(path.sep).join('/')}` }));
  // Game constants are shared between server and browser; serve them from the project root unless the build already copied them.
  const sharedDir = path.join(ROOT, 'shared');
  if (fs.existsSync(sharedDir)) for (const abs of walk(sharedDir)) {
    const rel = `/shared/${path.relative(sharedDir, abs).split(path.sep).join('/')}`;
    if (!sources.some((x) => x.rel === rel)) sources.push({ abs, rel });
  }
  for (const { abs, rel } of sources) {
    if (rel.endsWith('.map')) continue;
    const ext = path.extname(abs).toLowerCase();
    let raw = fs.readFileSync(abs);
    if (rel === '/index.html' || rel === '/sitemap.xml' || rel === '/robots.txt') raw = Buffer.from(raw.toString('utf8').replaceAll('%SITE_URL%', siteUrl));
    /** @type {Entry} */
    const entry = {
      raw, type: TYPES[ext] || 'application/octet-stream',
      etag: `"${crypto.createHash('sha1').update(raw).digest('base64url').slice(0, 20)}"`,
      cache: rel.startsWith('/assets/') ? 'public, max-age=604800, stale-while-revalidate=86400' : 'no-cache',
    };
    if (COMPRESSIBLE.has(ext) && raw.length > 800) {
      entry.gz = zlib.gzipSync(raw, { level: 9 });
      entry.br = zlib.brotliCompressSync(raw, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 8 } });
    }
    files.set(rel, entry);
  }
  const index = files.get('/index.html');
  if (!index) throw new Error(`No index.html found in ${dir}`);

  /**
   * @param {import('node:http').IncomingMessage} req @param {import('node:http').ServerResponse} res @param {string} pathname
   */
  return function serve(req, res, pathname) {
    let status = 200;
    let entry = files.get(pathname);
    if (!entry) {
      const first = pathname.split('/')[1] ?? '';
      if (!path.extname(pathname) && (SPA_ROOTS.has(first) || pathname === '/')) entry = index;
      else if (!path.extname(pathname)) { entry = index; status = 404; } else { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Not found'); return; }
    }
    const headers = /** @type {Record<string,string|number>} */ ({
      'Content-Type': entry.type, 'Cache-Control': entry === index ? 'no-cache' : entry.cache, ETag: entry.etag, Vary: 'Accept-Encoding',
    });
    if (status === 200 && req.headers['if-none-match'] === entry.etag) { res.writeHead(304, headers); res.end(); return; }
    const ae = String(req.headers['accept-encoding'] || '');
    let body = entry.raw;
    if (entry.br && /\bbr\b/.test(ae)) { body = entry.br; headers['Content-Encoding'] = 'br'; }
    else if (entry.gz && /\bgzip\b/.test(ae)) { body = entry.gz; headers['Content-Encoding'] = 'gzip'; }
    headers['Content-Length'] = body.length;
    res.writeHead(status, headers);
    res.end(req.method === 'HEAD' ? undefined : body);
  };
}

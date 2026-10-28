// Production build: copies the app into dist/public, minifies CSS, verifies every asset/import resolves, and syntax-checks all JS.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'dist', 'public');
const walk = (/** @type {string} */ d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const fail = (/** @type {string} */ m) => { console.error(`✖ build failed: ${m}`); process.exit(1); };

fs.rmSync(path.join(root, 'dist'), { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
fs.cpSync(path.join(root, 'public'), out, { recursive: true });
fs.cpSync(path.join(root, 'shared'), path.join(out, 'shared'), { recursive: true });

/** Conservative CSS minifier: strips comments and redundant whitespace; never touches values or calc() operators. */
const minCss = (/** @type {string} */ css) => css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').replace(/\s*([{};,])\s*/g, '$1').replace(/;}/g, '}').trim();
const cssFile = path.join(out, 'css', 'styles.css');
const before = fs.statSync(cssFile).size;
fs.writeFileSync(cssFile, minCss(fs.readFileSync(cssFile, 'utf8')));

// --- verify: every local import in JS and every local URL in index.html resolves to a built file ---
const files = walk(out);
const rel = (/** @type {string} */ f) => `/${path.relative(out, f).split(path.sep).join('/')}`;
const exists = new Set(files.map(rel));
const missing = /** @type {string[]} */ ([]);
for (const f of files.filter((x) => x.endsWith('.js'))) {
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(/(?:from\s*|import\s*\(\s*)['"](\.{1,2}\/[^'"]+)['"]/g)) {
    const target = new URL(m[1], `http://x${rel(f)}`).pathname; // same resolution a browser performs
    if (!exists.has(target)) missing.push(`${rel(f)} -> ${m[1]}`);
  }
  const check = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
  if (check.status !== 0) fail(`syntax error in ${rel(f)}\n${check.stderr}`);
}
const html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
for (const m of html.matchAll(/(?:href|src)="(\/[^"#?]*)"/g)) if (m[1] !== '/' && !m[1].startsWith('/clans') && !m[1].startsWith('/players') && !['/dashboard', '/settings', '/privacy'].includes(m[1]) && !exists.has(m[1])) missing.push(`index.html -> ${m[1]}`);
for (const asset of ['/assets/hero.webp', '/assets/hero-sm.webp', '/assets/join.webp', '/assets/og.jpg', '/favicon.svg']) if (!exists.has(asset)) missing.push(`required asset ${asset}`);
if (missing.length) fail(`unresolved references:\n  ${missing.join('\n  ')}`);

const total = files.reduce((n, f) => n + fs.statSync(f).size, 0);
const code = files.filter((f) => /\.(js|css|html)$/.test(f));
const gz = code.reduce((n, f) => n + zlib.gzipSync(fs.readFileSync(f)).length, 0);
fs.writeFileSync(path.join(root, 'dist', 'build-info.json'), JSON.stringify({ builtAt: new Date().toISOString(), files: files.length, bytes: total }, null, 2));
console.log(`✔ built ${files.length} files → dist/public (${(total / 1024).toFixed(0)} KB total)`);
console.log(`  CSS ${(before / 1024).toFixed(1)} KB → ${(fs.statSync(cssFile).size / 1024).toFixed(1)} KB minified; JS/CSS/HTML gzip total ${(gz / 1024).toFixed(1)} KB`);
console.log(`  all ${files.filter((x) => x.endsWith('.js')).length} JS modules pass a syntax check and every import resolves`);

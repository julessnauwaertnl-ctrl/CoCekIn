// Original procedural artwork: avatars, clan badges and cover scenes. No external or third-party assets.
import { s } from './dom.js';
import { PALETTE } from '../../shared/game.js';

let uid = 0;
const nextId = (/** @type {string} */ p) => `${p}${++uid}`;

const GLYPHS = /** @type {Record<string,string>} */ ({
  crown: 'M3 19h18v2H3zM3 8l4.5 4L12 3l4.5 9L21 8l-2 9H5z',
  sword: 'M19.92 4.08L19.5 7.62L12.0 15.11L8.89 12.0L16.38 4.5ZM6.34 9.45L14.55 17.66L12.99 19.21L4.79 11.01ZM8.11 14.33L9.67 15.89L6.98 18.58L5.42 17.02ZM6.63 17.37L6.63 20.49L3.51 20.49L3.51 17.37Z',
  shield: 'M12 2l8 3v6c0 5-3.4 9.3-8 11-4.6-1.7-8-6-8-11V5z',
  flame: 'M12 2c1 4 5 6 5 11a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5.2 1.5 1 2.5 2 3 0-4-1-6 1-9.5z',
  bolt: 'M13 2L4 14h6l-1 8 9-12h-6z',
  skull: 'M12 2a8 8 0 0 0-8 8c0 3 1.5 5 3 6v4h2v-2h1v2h4v-2h1v2h2v-4c1.5-1 3-3 3-6a8 8 0 0 0-8-8zM8.5 9.3a1.7 1.7 0 1 0 0 3.4 1.7 1.7 0 0 0 0-3.4zm7 0a1.7 1.7 0 1 0 0 3.4 1.7 1.7 0 0 0 0-3.4z',
  gem: 'M6 3h12l4 6-10 13L2 9z',
  wing: 'M2 21C2 11 8 4.5 21 3c-1 3-3 5.5-5.5 6.8 2.500.2 4.800-.6 6.500-2-.6 4.5-3.6 8-8 9 2 .3 4 .1 5.8-.8C18.5 19 12 21.5 2 21z',
  tower: 'M4 21V8h3V5h2v3h2V5h2v3h2V5h2v3h3v13h-5v-5a3 3 0 0 0-6 0v5z',
  star: 'M12 2l3 6.5 7 .9-5.2 4.8 1.4 7L12 17.8 5.8 21.2l1.4-7L2 9.4l7-.9z',
});

/** @param {string} key @returns {[string,string]} */
const pal = (key) => /** @type {[string,string]} */ (PALETTE[/** @type {keyof typeof PALETTE} */ (key)] || PALETTE.gold);

/** Emblem glyph on its own (used for achievements). @param {string} name @param {number} size @param {string} [fill] */
export function glyph(name, size = 24, fill = 'currentColor') {
  return s('svg', { viewBox: '0 0 24 24', width: size, height: size, 'aria-hidden': 'true', focusable: 'false' },
    s('path', { d: GLYPHS[name] || GLYPHS.star, fill, 'fill-rule': 'evenodd' }));
}

/**
 * Player avatar. key is "<emblem>-<colour>", e.g. "crown-gold".
 * @param {string} key @param {number} [size] @param {string} [label]
 */
export function avatar(key, size = 48, label = '') {
  const [emblem, color] = String(key).split('-');
  const [c1, c2] = pal(color);
  const g = nextId('av');
  const svg = s('svg', { viewBox: '0 0 64 64', width: size, height: size, class: 'avatar-art', role: label ? 'img' : 'presentation', 'aria-label': label || null, 'aria-hidden': label ? null : 'true' },
    s('defs', null,
      s('linearGradient', { id: g, x1: 0, y1: 0, x2: 0, y2: 1 }, s('stop', { offset: '0', 'stop-color': c1 }), s('stop', { offset: '1', 'stop-color': c2 }))),
    s('circle', { cx: 32, cy: 32, r: 30, fill: '#2a1d4a' }),
    s('circle', { cx: 32, cy: 32, r: 27, fill: `url(#${g})`, stroke: '#ffe27a', 'stroke-width': 3 }),
    s('circle', { cx: 32, cy: 24, r: 20, fill: '#fff', opacity: 0.12 }),
    s('g', { transform: 'translate(16 17) scale(1.33)' },
      s('path', { d: GLYPHS[emblem] || GLYPHS.crown, fill: 'rgba(0,0,0,.35)', transform: 'translate(0 1.2)', 'fill-rule': 'evenodd' }),
      s('path', { d: GLYPHS[emblem] || GLYPHS.crown, fill: '#fff', 'fill-rule': 'evenodd' })));
  return svg;
}

/**
 * Clan badge (shield). @param {string} emblem @param {string} color @param {number} [size] @param {string} [label]
 */
export function clanBadge(emblem, color, size = 56, label = '') {
  const [c1, c2] = pal(color);
  const g = nextId('cb');
  const d = 'M32 3l24 8v18c0 15-10 27-24 32C18 56 8 44 8 29V11z';
  return s('svg', { viewBox: '0 0 64 64', width: size, height: size, class: 'badge-art', role: label ? 'img' : 'presentation', 'aria-label': label || null, 'aria-hidden': label ? null : 'true' },
    s('defs', null, s('linearGradient', { id: g, x1: 0, y1: 0, x2: 0, y2: 1 }, s('stop', { offset: '0', 'stop-color': c1 }), s('stop', { offset: '1', 'stop-color': c2 }))),
    s('path', { d, fill: '#ffe27a' }),
    s('path', { d, fill: `url(#${g})`, transform: 'translate(32 33) scale(.86) translate(-32 -33)' }),
    s('path', { d: 'M32 7l20 6.7V29c0 3-.3 5.8-1 8.500C44 28 38 16 32 7z', fill: '#fff', opacity: 0.12 }),
    s('g', { transform: 'translate(18.5 16) scale(1.1)' },
      s('path', { d: GLYPHS[emblem] || GLYPHS.shield, fill: 'rgba(0,0,0,.35)', transform: 'translate(0 1)', 'fill-rule': 'evenodd' }),
      s('path', { d: GLYPHS[emblem] || GLYPHS.shield, fill: '#fff', 'fill-rule': 'evenodd' })));
}

/** Deterministic pseudo-random generator. @param {number} seed */
function rng(seed) { let t = seed >>> 0; return () => { t += 0x6d2b79f5; let x = Math.imul(t ^ (t >>> 15), 1 | t); x ^= x + Math.imul(x ^ (x >>> 7), 61 | x); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; }

/** @param {number} seed @param {number} base @param {number} amp @param {number} step */
function ridge(seed, base, amp, step) {
  const r = rng(seed);
  let d = `M0 400 L0 ${base}`;
  for (let x = step; x <= 1200 + step; x += step) d += ` L${x} ${Math.round(base - r() * amp)}`;
  return `${d} L1200 400 Z`;
}

/** @param {number} seed @param {number} y @param {number} n @param {number} h */
function pines(seed, y, n, h) {
  const r = rng(seed);
  let d = '';
  for (let i = 0; i < n; i++) {
    const x = Math.round(r() * 1200); const hh = h * (0.6 + r() * 0.8); const w = hh * 0.38;
    d += `M${x} ${y - hh}L${Math.round(x + w)} ${y}L${Math.round(x - w)} ${y}Z`;
  }
  return d;
}

/** @param {number} seed @param {number} n @param {number} maxY */
function dots(seed, n, maxY) {
  const r = rng(seed);
  return Array.from({ length: n }, () => ({ x: Math.round(r() * 1200), y: Math.round(r() * maxY), r: 0.6 + r() * 1.6, o: 0.4 + r() * 0.6 }));
}

/** @param {number} x @param {number} y @param {string} fill */
function keep(x, y, fill) {
  return s('g', { transform: `translate(${x} ${y})`, fill },
    s('path', { d: 'M-70 0V-70h18v-18h14v18h16v-30h18v30h16v-18h14v18h18V0z' }),
    s('path', { d: 'M-10 -120h20v-20l-10-10-10 10z' }),
    s('path', { d: 'M-44 -88h8v-22h-8zM36 -88h8v-22h-8z' }));
}

const SCENES = /** @type {Record<string,(id:(n:string)=>string)=>SVGElement[]>} */ ({
  'sunset-keep': (id) => [
    s('defs', null, s('linearGradient', { id: id('sky'), x1: 0, y1: 0, x2: 0, y2: 1 },
      s('stop', { offset: '0', 'stop-color': '#4b2a7a' }), s('stop', { offset: '.55', 'stop-color': '#e2546f' }), s('stop', { offset: '1', 'stop-color': '#ffb347' }))),
    s('rect', { width: 1200, height: 400, fill: `url(#${id('sky')})` }),
    s('circle', { cx: 880, cy: 250, r: 70, fill: '#ffe9a8', opacity: 0.9 }),
    s('path', { d: ridge(11, 270, 90, 60), fill: '#6b3a86', opacity: 0.8 }),
    s('path', { d: ridge(12, 320, 70, 50), fill: '#43255e' }),
    keep(840, 330, '#2a1640'),
    s('path', { d: ridge(13, 365, 40, 40), fill: '#1a0e2b' }),
  ],
  'dark-forest': (id) => [
    s('defs', null, s('linearGradient', { id: id('sky'), x1: 0, y1: 0, x2: 0, y2: 1 }, s('stop', { offset: '0', 'stop-color': '#0b1d1a' }), s('stop', { offset: '1', 'stop-color': '#1d5a45' }))),
    s('rect', { width: 1200, height: 400, fill: `url(#${id('sky')})` }),
    s('circle', { cx: 960, cy: 100, r: 46, fill: '#e8f5d0', opacity: 0.9 }),
    s('path', { d: pines(21, 330, 38, 120), fill: '#134032', opacity: 0.8 }),
    s('path', { d: pines(22, 370, 34, 170), fill: '#0b2a22' }),
    s('path', { d: pines(23, 410, 24, 230), fill: '#06150f' }),
  ],
  'lava-fields': (id) => [
    s('defs', null, s('linearGradient', { id: id('sky'), x1: 0, y1: 0, x2: 0, y2: 1 }, s('stop', { offset: '0', 'stop-color': '#2a0a12' }), s('stop', { offset: '1', 'stop-color': '#b3261e' }))),
    s('rect', { width: 1200, height: 400, fill: `url(#${id('sky')})` }),
    s('path', { d: 'M180 400 L420 150 L520 150 L760 400Z', fill: '#2b0f10' }),
    s('path', { d: 'M440 150 L470 230 L430 310 L480 400 L520 400 L500 300 L520 220 L510 150Z', fill: '#ff8a2a' }),
    s('path', { d: ridge(31, 340, 60, 70), fill: '#190808' }),
    ...dots(32, 40, 300).map((d) => s('circle', { cx: d.x, cy: d.y, r: d.r, fill: '#ffb347', opacity: d.o })),
  ],
  'frozen-peaks': (id) => [
    s('defs', null, s('linearGradient', { id: id('sky'), x1: 0, y1: 0, x2: 0, y2: 1 }, s('stop', { offset: '0', 'stop-color': '#10335c' }), s('stop', { offset: '1', 'stop-color': '#8fd3f4' }))),
    s('rect', { width: 1200, height: 400, fill: `url(#${id('sky')})` }),
    s('path', { d: 'M0 120 C300 40 700 200 1200 60 L1200 150 C800 230 300 100 0 190Z', fill: '#58e1c1', opacity: 0.22 }),
    s('path', { d: ridge(41, 250, 160, 90), fill: '#dff3ff', opacity: 0.85 }),
    s('path', { d: ridge(42, 320, 120, 70), fill: '#7aa7d1' }),
    s('path', { d: ridge(43, 375, 50, 40), fill: '#e9f7ff' }),
    ...dots(44, 60, 400).map((d) => s('circle', { cx: d.x, cy: d.y, r: d.r, fill: '#fff', opacity: d.o })),
  ],
  'golden-dunes': (id) => [
    s('defs', null, s('linearGradient', { id: id('sky'), x1: 0, y1: 0, x2: 0, y2: 1 }, s('stop', { offset: '0', 'stop-color': '#f7b84b' }), s('stop', { offset: '1', 'stop-color': '#fff1b8' }))),
    s('rect', { width: 1200, height: 400, fill: `url(#${id('sky')})` }),
    s('circle', { cx: 300, cy: 150, r: 64, fill: '#fff7d6' }),
    s('path', { d: 'M0 300 C200 220 400 330 640 270 S1000 230 1200 300 V400 H0Z', fill: '#e39a2d' }),
    s('path', { d: 'M780 270 L840 190 L900 270Z M860 290 L900 230 L940 290Z', fill: '#b8741d' }),
    s('path', { d: 'M0 350 C250 290 500 380 760 330 S1050 300 1200 350 V400 H0Z', fill: '#c47a1c' }),
  ],
  'night-siege': (id) => [
    s('defs', null, s('linearGradient', { id: id('sky'), x1: 0, y1: 0, x2: 0, y2: 1 }, s('stop', { offset: '0', 'stop-color': '#070816' }), s('stop', { offset: '1', 'stop-color': '#2b2160' }))),
    s('rect', { width: 1200, height: 400, fill: `url(#${id('sky')})` }),
    ...dots(51, 80, 260).map((d) => s('circle', { cx: d.x, cy: d.y, r: d.r, fill: '#fff', opacity: d.o })),
    s('circle', { cx: 220, cy: 110, r: 40, fill: '#f5f0d8' }),
    s('circle', { cx: 236, cy: 100, r: 36, fill: '#0e0c26' }),
    s('path', { d: ridge(52, 320, 60, 80), fill: '#161235' }),
    keep(780, 340, '#0a0820'),
    s('path', { d: 'M752 300h8v12h-8zM800 300h8v12h-8zM775 262h10v14h-10z', fill: '#ffc84a' }),
    s('path', { d: 'M100 330 L420 190', stroke: '#ff9a3c', 'stroke-width': 3, 'stroke-dasharray': '2 10', 'stroke-linecap': 'round', fill: 'none' }),
  ],
});

/** Cover scene. @param {string} key @param {string} [cls] */
export function cover(key, cls = '') {
  const prefix = nextId('sc');
  const id = (/** @type {string} */ n) => `${prefix}-${n}`;
  const scene = SCENES[key] || SCENES['sunset-keep'];
  return s('svg', { viewBox: '0 0 1200 400', preserveAspectRatio: 'xMidYMid slice', class: `cover-art ${cls}`.trim(), 'aria-hidden': 'true', focusable: 'false' }, ...scene(id));
}

/** Brand mark. @param {number} [size] */
export function logo(size = 34) {
  return s('svg', { viewBox: '0 0 64 64', width: size, height: size, 'aria-hidden': 'true', focusable: 'false' },
    s('path', { d: 'M32 3l24 8v18c0 15-10 27-24 32C18 56 8 44 8 29V11z', fill: '#ffd45a', stroke: '#8a5200', 'stroke-width': 3, 'stroke-linejoin': 'round' }),
    s('path', { d: 'M32 9l18 6v14c0 11-7.5 20-18 24C21.5 49 14 40 14 29V15z', fill: '#6d28d9' }),
    s('path', { d: 'M22 31l7 7 14-15', fill: 'none', stroke: '#fff', 'stroke-width': 6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
}



// Tiny DOM helpers. Everything is built with createElement/textContent, never innerHTML, so user content cannot inject markup.

/** @param {HTMLElement|SVGElement} el @param {Record<string, any>|null|undefined} props */
function applyProps(el, props) {
  if (!props) return;
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.setAttribute('class', String(v));
    else if (k === 'style' && typeof v === 'object') {
      for (const [sk, sv] of Object.entries(v)) {
        if (sk.startsWith('--')) el.style.setProperty(sk, String(sv));
        else /** @type {any} */ (el.style)[sk] = sv;
      }
    } else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
}

/** @param {Node} el @param {any[]} children */
function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false || c === true) continue;
    el.appendChild(typeof c === 'object' && 'nodeType' in c ? c : document.createTextNode(String(c)));
  }
}

/**
 * Create an HTML element. Property-like attributes that need to be set as DOM properties
 * (value, checked, disabled, selected) are applied after children so <select> works.
 * @param {string} tag @param {Record<string, any>|null} [props] @param {...any} children
 * @returns {HTMLElement}
 */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  /** @type {Record<string, any>} */
  const attrs = {};
  /** @type {Record<string, any>} */
  const bag = {};
  for (const [k, v] of Object.entries(props || {})) (['value', 'checked', 'disabled', 'selected', 'indeterminate'].includes(k) ? bag : attrs)[k] = v;
  applyProps(el, attrs);
  append(el, children);
  for (const [k, v] of Object.entries(bag)) { if (v != null) /** @type {any} */ (el)[k] = v; }
  return el;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
/** @param {string} tag @param {Record<string, any>|null} [props] @param {...any} children @returns {SVGElement} */
export function s(tag, props, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  applyProps(el, props);
  append(el, children);
  return el;
}

/** Replace all children of a node. @param {Node} node @param {...any} children */
export function mount(node, ...children) {
  while (node.firstChild) node.removeChild(node.firstChild);
  append(node, children);
  return node;
}

const ICONS = /** @type {Record<string,string>} */ ({
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.5-4.5',
  menu: 'M4 6h16M4 12h16M4 18h16',
  close: 'M6 6l12 12M18 6L6 18',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  trophy: 'M8 21h8M12 17v4M7 4h10v6a5 5 0 0 1-10 0V4zM7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3',
  sword: 'M14.5 17.5L3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2',
  shield: 'M12 3l8 3v6c0 5-3.4 8.3-8 9-4.6-.7-8-4-8-9V6l8-3z',
  plus: 'M12 5v14M5 12h14',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  alert: 'M12 3L2 20h20L12 3zM12 10v4M12 17.5v.01',
  filter: 'M3 5h18l-7 8v6l-4-2v-4L3 5z',
  down: 'M6 9l6 6 6-6',
  right: 'M9 6l6 6-6 6',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  sliders: 'M4 6h10M18 6h2M4 12h2M10 12h10M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4',
  logout: 'M9 21H5V3h4M16 17l5-5-5-5M21 12H9',
  home: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18',
  lock: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4',
  refresh: 'M20 11a8 8 0 0 0-14-4M4 4v4h4M4 13a8 8 0 0 0 14 4M20 20v-4h-4',
  verified: 'M12 2l2.4 2 3.1-.3 1 3L21 8.5l-1 3 1 3-2.5 1.8-1 3-3.1-.3L12 22l-2.4-2-3.1.3-1-3L3 15.5l1-3-1-3L5.5 7.7l1-3 3.1.3L12 2zM8.5 12l2.5 2.5L16 9.5',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  inbox: 'M4 13l2-8h12l2 8M4 13v6h16v-6M4 13h5l1 2h4l1-2h5',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  edit: 'M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4',
  copy: 'M9 9h11v11H9zM5 15V4h11',
  heart: 'M12 20s-8-4.7-8-10.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 8 2.5C20 15.3 12 20 12 20z',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 7.5v.01',
  dots: 'M5 12h.01M12 12h.01M19 12h.01',
  crown: 'M3 19h18M3 8l4.5 4L12 4l4.5 8L21 8l-2 9H5z',
  star: 'M12 3l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.8 6.1 21l1.2-6.5L2.5 9.9 9.1 9z',
  bolt: 'M13 2L4 14h6l-1 8 9-12h-6l1-8z',
  flame: 'M12 3c1 4 5 6 5 10.5a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5.2 1.5 1 2.5 2 3 0-4-1-6 1-9z',
  gem: 'M6 3h12l4 6-10 13L2 9l4-6zM2 9h20M9 3l-2 6 5 13 5-13-2-6',
  tower: 'M4 21V8h3V5h2v3h2V5h2v3h2V5h2v3h3v13H4zM10 21v-5a2 2 0 0 1 4 0v5',
  wing: 'M2 4c8 0 14 4 16 12-3-2-6-3-9-3 2 1 3.5 3 4 5-5-1-9-5-11-14z',
  skull: 'M12 3a8 8 0 0 0-8 8c0 3 1.5 5 3 6v4h2v-2h1v2h4v-2h1v2h2v-4c1.5-1 3-3 3-6a8 8 0 0 0-8-8zM9 11v.01M15 11v.01',
  map: 'M12 21s7-6 7-11a7 7 0 1 0-14 0c0 5 7 11 7 11zM12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
});

/** Stroke icon. @param {string} name @param {number} [size] @param {string} [cls] */
export function icon(name, size = 20, cls = '') {
  return s('svg', { viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false', class: `icon ${cls}`.trim() },
    s('path', { d: ICONS[name] || ICONS.info }));
}

/** @param {number|null|undefined} n */
export const num = (n) => (n == null ? '—' : new Intl.NumberFormat('en').format(n));

/** @param {string|null|undefined} iso */
export function ago(iso) {
  if (!iso) return '';
  const diff = (Date.parse(iso) - Date.now()) / 1000;
  const units = /** @type {[Intl.RelativeTimeFormatUnit, number][]} */ ([['year', 31536000], ['month', 2592000], ['day', 86400], ['hour', 3600], ['minute', 60]]);
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  for (const [u, sec] of units) if (Math.abs(diff) >= sec) return rtf.format(Math.round(diff / sec), u);
  return 'just now';
}

/** @param {string|null|undefined} iso */
export const dateLabel = (iso) => (iso ? new Date(iso).toLocaleDateString('en', { year: 'numeric', month: 'short', day: 'numeric' }) : '');

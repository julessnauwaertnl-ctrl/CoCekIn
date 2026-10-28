import { mount, h } from './dom.js';
import { session } from './state.js';

/** @typedef {{ path:string, params:Record<string,string>, query:URLSearchParams, root:HTMLElement, alive:()=>boolean, setTitle:(t:string)=>void, setQuery:(o:Record<string,string|null|undefined>)=>void }} PageCtx */
/** @typedef {(ctx:PageCtx)=>Promise<void|(()=>void)>|void|(()=>void)} PageFn */

/** @type {{regex:RegExp, keys:string[], load:()=>Promise<{default:PageFn}>, auth:boolean}[]} */
const routes = [];
/** @type {HTMLElement} */ let outlet;
/** @type {(()=>void)|undefined} */ let cleanup;
let current = 0;
/** @type {(path:string)=>void} */ let onNavigate = () => {};

/** @param {string} pattern @param {()=>Promise<{default:PageFn}>} load @param {{auth?:boolean}} [o] */
export function route(pattern, load, o = {}) {
  /** @type {string[]} */ const keys = [];
  const src = pattern.replace(/:([a-z]+)/g, (_m, k) => { keys.push(k); return '([^/]+)'; });
  routes.push({ regex: new RegExp(`^${src}/?$`), keys, load, auth: !!o.auth });
}

/** Only allow same-site relative redirects. @param {string|null|undefined} next @param {string} [fallback] */
export function safeNext(next, fallback = '/dashboard') {
  return next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : fallback;
}

/** @param {string} url @param {{replace?:boolean}} [o] */
export function navigate(url, o = {}) {
  if (o.replace) history.replaceState({}, '', url); else history.pushState({}, '', url);
  return render(url, true);
}

/** @param {string} t */
const setTitle = (t) => { document.title = t ? `${t} · CoCekIn` : 'CoCekIn — Find your clan. Rule the war.'; };

/** @param {string} url @param {boolean} fresh */
async function render(url, fresh) {
  const token = ++current;
  const u = new URL(url, location.origin);
  const path = u.pathname.replace(/\/+$/, '') || '/';
  cleanup?.(); cleanup = undefined;
  onNavigate(path);
  let match = null;
  /** @type {Record<string,string>} */
  const params = {};
  for (const r of routes) {
    const m = r.regex.exec(path);
    if (m) { match = r; r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); }); break; }
  }
  if (match?.auth && !session.me) { navigate(`/login?next=${encodeURIComponent(path + u.search)}`, { replace: true }); return; }
  outlet.setAttribute('aria-busy', 'true');
  /** @type {PageCtx} */
  const ctx = {
    path, params, query: u.searchParams, root: outlet, alive: () => token === current, setTitle,
    setQuery(o) {
      const sp = new URLSearchParams(location.search);
      for (const [k, v] of Object.entries(o)) { if (v == null || v === '') sp.delete(k); else sp.set(k, v); }
      const q = sp.toString();
      history.replaceState({}, '', location.pathname + (q ? `?${q}` : ''));
      ctx.query = new URLSearchParams(q);
    },
  };
  try {
    const mod = await (match ? match.load() : import('./pages/notfound.js'));
    if (token !== current) return;
    mount(outlet);
    setTitle(match ? '' : 'Page not found');
    const c = await mod.default(ctx);
    if (token !== current) { if (typeof c === 'function') c(); return; }
    if (typeof c === 'function') cleanup = c;
  } catch (e) {
    if (token !== current) return;
    console.error(e);
    setTitle('Something went wrong');
    mount(outlet, h('section', { class: 'container page-state' },
      h('div', { class: 'state-card', role: 'alert' },
        h('h1', { class: 'display' }, 'This page failed to load'),
        h('p', null, 'Check your connection and try again.'),
        h('button', { class: 'btn btn-primary', type: 'button', onclick: () => render(url, false) }, 'Try again'))));
  } finally {
    if (token === current) {
      outlet.removeAttribute('aria-busy');
      if (fresh) { window.scrollTo(0, 0); outlet.focus({ preventScroll: true }); }
    }
  }
}

/** @param {HTMLElement} el @param {(path:string)=>void} onNav */
export function startRouter(el, onNav) {
  outlet = el; onNavigate = onNav;
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = /** @type {HTMLElement} */ (e.target).closest?.('a');
    if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
    const href = a.getAttribute('href');
    if (!href || !href.startsWith('/') || href.startsWith('//') || href.startsWith('/api/')) return;
    e.preventDefault();
    navigate(href);
  });
  window.addEventListener('popstate', () => render(location.pathname + location.search, false));
  return render(location.pathname + location.search, true);
}

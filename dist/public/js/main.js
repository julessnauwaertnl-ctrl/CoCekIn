import { h, icon, mount, s } from './dom.js';
import { avatar, logo } from './art.js';
import { post } from './api.js';
import { loadMeta, onSession, refreshMe, session, setMe } from './state.js';
import { navigate, route, startRouter } from './router.js';
import { toast } from './ui.js';

/* ---------- Routes (pages are lazy-loaded) ---------- */
route('/', () => import('./pages/home.js'));
route('/clans', () => import('./pages/clans.js'));
route('/clans/new', () => import('./pages/clan-form.js'), { auth: true });
route('/clans/:slug', () => import('./pages/clan.js'));
route('/players', () => import('./pages/players.js'));
route('/u/:handle', () => import('./pages/profile.js'));
route('/login', () => import('./pages/auth.js'));
route('/register', () => import('./pages/auth.js'));
route('/settings', () => import('./pages/settings.js'), { auth: true });
route('/dashboard', () => import('./pages/dashboard.js'), { auth: true });
route('/privacy', () => import('./pages/privacy.js'));

/* ---------- Chrome ---------- */
const NAV = [
  { href: '/clans', label: 'Clans', icon: 'shield' },
  { href: '/players', label: 'Players', icon: 'users' },
];

const headerEl = /** @type {HTMLElement} */ (document.getElementById('site-header'));
const bottomEl = /** @type {HTMLElement} */ (document.getElementById('bottom-nav'));
let currentPath = '/';
/** @type {(() => void)|null} */ let closeMenu = null;

/** @param {string} href */
const isActive = (href) => (href === '/' ? currentPath === '/' : currentPath === href || currentPath.startsWith(`${href}/`));

function userMenu() {
  const u = session.me;
  const menu = h('ul', { class: 'menu', role: 'menu', hidden: true, id: 'user-menu' },
    ...[['/u/' + u.handle, 'My profile', 'user'], ['/dashboard', 'Dashboard', 'home'], ['/settings', 'Settings', 'sliders']].map(([href, label, ic]) =>
      h('li', { role: 'none' }, h('a', { role: 'menuitem', href }, icon(ic, 18), label))),
    h('li', { role: 'none' }, h('button', { role: 'menuitem', type: 'button', onclick: signOut }, icon('logout', 18), 'Sign out')));
  const trigger = h('button', { class: 'user-trigger', type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-controls': 'user-menu' },
    avatar(u.avatar, 34, ''), h('span', { class: 'user-name' }, u.displayName), icon('down', 16));
  const wrap = h('div', { class: 'user-menu-wrap' }, trigger, menu);
  const close = () => { menu.hidden = true; trigger.setAttribute('aria-expanded', 'false'); document.removeEventListener('click', outside); };
  /** @param {Event} e */
  const outside = (e) => { if (!wrap.contains(/** @type {Node} */ (e.target))) close(); };
  trigger.addEventListener('click', () => {
    if (menu.hidden) { menu.hidden = false; trigger.setAttribute('aria-expanded', 'true'); document.addEventListener('click', outside); /** @type {HTMLElement|null} */ (menu.querySelector('a,button'))?.focus(); } else close();
  });
  wrap.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !menu.hidden) { close(); trigger.focus(); return; }
    if (menu.hidden || !['ArrowDown', 'ArrowUp'].includes(e.key)) return;
    const items = /** @type {HTMLElement[]} */ ([...menu.querySelectorAll('a,button')]);
    const i = items.indexOf(/** @type {HTMLElement} */ (document.activeElement));
    e.preventDefault();
    items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
  });
  menu.addEventListener('click', close);
  closeMenu = close;
  return wrap;
}

async function signOut() {
  try { await post('/auth/logout'); } catch { /* cookie may already be gone */ }
  setMe(null);
  toast('You have been signed out.', 'success');
  navigate('/');
}

function renderChrome() {
  closeMenu?.();
  const u = session.me;
  mount(headerEl, h('div', { class: 'container header-inner' },
    h('a', { href: '/', class: 'brand', 'aria-label': 'CoCekIn home' }, logo(36), h('span', { class: 'brand-name display' }, 'Co', h('span', null, 'Cek'), 'In')),
    h('nav', { class: 'nav-main', 'aria-label': 'Primary' }, ...NAV.map((n) => h('a', { href: n.href, 'aria-current': isActive(n.href) ? 'page' : null }, n.label))),
    h('div', { class: 'header-actions' },
      u ? [h('a', { class: 'btn btn-secondary btn-sm hide-sm', href: '/clans/new' }, icon('plus', 16), h('span', null, 'Found a clan')), userMenu()]
        : [h('a', { class: 'btn btn-ghost btn-sm', href: '/login' }, 'Sign in'), h('a', { class: 'btn btn-primary btn-sm', href: '/register' }, h('span', null, 'Join free'))])));
  const account = u ? { href: '/dashboard', label: 'Me', icon: 'user' } : { href: '/login', label: 'Sign in', icon: 'user' };
  const items = [{ href: '/', label: 'Home', icon: 'home' }, ...NAV, account];
  mount(bottomEl, ...items.map((n) => h('a', { href: n.href, class: 'bn-item', 'aria-current': isActive(n.href) || (u && n.href === '/dashboard' && (currentPath === '/settings' || currentPath.startsWith('/u/' + u.handle))) ? 'page' : null }, icon(n.icon, 22), h('span', null, n.label))));
}

onSession(renderChrome);

(async () => {
  const outlet = /** @type {HTMLElement} */ (document.getElementById('main'));
  await Promise.all([refreshMe(), loadMeta()]);
  renderChrome();
  startRouter(outlet, (p) => { currentPath = p; renderChrome(); });
})();

import { h, icon, mount } from '../dom.js';
import { get, qs } from '../api.js';
import { session } from '../state.js';
import { btn, emptyState, errorState, field, pagination, skeletons, toggle } from '../ui.js';
import { playerCard } from '../components.js';
import { LANGUAGES, MAX_TH } from '../../../shared/game.js';

const SORTS = [
  { value: 'trophies', label: 'Most trophies' }, { value: 'th', label: 'Highest Town Hall' }, { value: 'war', label: 'Most war stars' },
  { value: 'newest', label: 'Newest' }, { value: 'name', label: 'Name (A–Z)' },
];
const thOpts = (/** @type {string} */ any) => [{ value: '', label: any }, ...Array.from({ length: MAX_TH }, (_, i) => ({ value: String(i + 1), label: `TH ${i + 1}` }))];

/** @param {import('../router.js').PageCtx} ctx */
export default function players(ctx) {
  ctx.setTitle('Players');
  const me = session.me;
  const q = ctx.query;
  const state = { q: q.get('q') || '', thMin: q.get('thMin') || '', thMax: q.get('thMax') || '', language: q.get('language') || '', lfc: q.get('lfc') === '1',
    verified: q.get('verified') === '1', sort: q.get('sort') || 'trophies', page: Math.max(1, Number(q.get('page')) || 1) };
  let reqId = 0;
  /** @type {ReturnType<typeof setTimeout>|undefined} */ let timer;

  const search = field({ label: 'Search players', name: 'q', type: 'search', value: state.q, placeholder: 'Name, username or #tag', maxlength: 40 });
  const thMin = field({ label: 'Min Town Hall', name: 'thMin', type: 'select', value: state.thMin, options: thOpts('Any') });
  const thMax = field({ label: 'Max Town Hall', name: 'thMax', type: 'select', value: state.thMax, options: thOpts('Any') });
  const language = field({ label: 'Language', name: 'language', type: 'select', value: state.language, options: [{ value: '', label: 'Any' }, ...LANGUAGES.map((l) => ({ value: l.key, label: l.label }))] });
  const sort = field({ label: 'Sort by', name: 'sort', type: 'select', value: state.sort, options: SORTS });
  const lfc = toggle({ label: 'Looking for a clan', checked: state.lfc, onChange: (v) => { state.lfc = v; apply(); } });
  const verified = toggle({ label: 'Verified only', checked: state.verified, onChange: (v) => { state.verified = v; apply(); } });
  search.input.addEventListener('input', () => { state.q = search.input.value; apply(true); });
  for (const [f, k] of /** @type {const} */ ([[thMin, 'thMin'], [thMax, 'thMax'], [language, 'language'], [sort, 'sort']])) f.input.addEventListener('change', () => { state[k] = f.input.value; apply(); });

  const count = h('p', { class: 'result-count', 'aria-live': 'polite' }, 'Searching…');
  const grid = h('div', { class: 'grid-cards', 'aria-busy': 'true' });
  const pager = h('div', { class: 'pager' });

  function reset() {
    Object.assign(state, { q: '', thMin: '', thMax: '', language: '', lfc: false, verified: false, page: 1 });
    search.input.value = ''; thMin.input.value = ''; thMax.input.value = ''; language.input.value = ''; lfc.input.checked = false; verified.input.checked = false;
    apply();
  }
  /** @param {boolean} [debounce] */
  function apply(debounce = false) { state.page = 1; clearTimeout(timer); timer = setTimeout(load, debounce ? 350 : 0); }

  async function load() {
    const id = ++reqId;
    ctx.setQuery({ q: state.q.trim(), thMin: state.thMin, thMax: state.thMax, language: state.language, lfc: state.lfc ? '1' : '', verified: state.verified ? '1' : '', sort: state.sort === 'trophies' ? '' : state.sort, page: state.page > 1 ? String(state.page) : '' });
    grid.setAttribute('aria-busy', 'true'); mount(grid, ...skeletons(6)); mount(pager);
    try {
      const r = await get(`/players${qs({ q: state.q.trim(), thMin: state.thMin, thMax: state.thMax, language: state.language, lfc: state.lfc, verified: state.verified, sort: state.sort, page: state.page > 1 ? state.page : '', pageSize: 12 })}`);
      if (id !== reqId || !ctx.alive()) return;
      count.textContent = r.total === 0 ? 'No players found' : `${r.total} ${r.total === 1 ? 'player' : 'players'} found`;
      if (!r.items.length) {
        const filtered = state.q || state.thMin || state.thMax || state.language || state.lfc || state.verified;
        mount(grid, h('div', { class: 'span-all' }, emptyState(filtered
          ? { icon: 'search', title: 'No players match these filters', text: 'Try widening the Town Hall range or clearing a filter.', actions: [btn('Clear filters', { variant: 'primary', onClick: reset })] }
          : { icon: 'users', title: 'No players yet', text: 'Create a profile and be the first on the board.', actions: [btn('Create profile', { variant: 'primary', href: me ? '/settings' : '/register' })] })));
      } else mount(grid, ...r.items.map(playerCard));
      mount(pager, pagination({ page: r.page, pages: r.pages, onPage: (p) => { state.page = p; load(); window.scrollTo({ top: 0, behavior: 'smooth' }); } }));
    } catch (e) {
      if (id !== reqId || !ctx.alive()) return;
      count.textContent = 'Could not load players';
      mount(grid, h('div', { class: 'span-all' }, errorState(e, load)));
    } finally { if (id === reqId) grid.removeAttribute('aria-busy'); }
  }

  mount(ctx.root, h('section', { class: 'container page' },
    h('header', { class: 'page-head' }, h('p', { class: 'eyebrow' }, 'Player directory'), h('h1', { class: 'display' }, 'Meet the chiefs'),
      h('p', { class: 'lead' }, 'Browse player profiles, see who is recruitable, and find your next co-leader.')),
    h('form', { class: 'card filter-bar', role: 'search', onsubmit: (/** @type {Event} */ e) => e.preventDefault() },
      search.el, thMin.el, thMax.el, language.el, sort.el, h('div', { class: 'filter-bar-toggles' }, lfc.el, verified.el)),
    h('div', { class: 'toolbar' }, count, h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: reset }, 'Clear filters')),
    grid, pager));
  load();
  return () => { clearTimeout(timer); reqId++; };
}

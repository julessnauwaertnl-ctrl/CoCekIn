import { h, icon, mount } from '../dom.js';
import { get, qs } from '../api.js';
import { session } from '../state.js';
import { btn, emptyState, errorState, field, pagination, skeletons, toggle } from '../ui.js';
import { clanCard, focusLabel, langLabel, typeLabel, warLabel } from '../components.js';
import { CLAN_TYPES, FOCUSES, LANGUAGES, MAX_TH, WAR_FREQUENCIES } from '../../../shared/game.js';

const SORTS = [
  { value: 'match', label: 'Best match' }, { value: 'members', label: 'Most members' },
  { value: 'trophies', label: 'Most trophies' }, { value: 'newest', label: 'Newest' }, { value: 'name', label: 'Name (A–Z)' },
];
const anyOpt = (/** @type {string} */ label) => ({ value: '', label });

/** @param {import('../router.js').PageCtx} ctx */
export default function clans(ctx) {
  ctx.setTitle('Find a clan');
  const me = session.me;
  const q = ctx.query;
  const state = {
    q: q.get('q') || '', type: (q.get('type') || '').split(',').filter(Boolean), language: q.get('language') || '', war: q.get('war') || '',
    focus: q.get('focus') || '', th: q.get('th') || '', trophies: q.get('trophies') || '', slots: q.get('slots') === '1', qualify: q.get('qualify') === '1' && !!me,
    sort: q.get('sort') || 'match', page: Math.max(1, Number(q.get('page')) || 1),
  };
  let reqId = 0;
  /** @type {ReturnType<typeof setTimeout>|undefined} */ let timer;

  /* ----- controls ----- */
  const search = /** @type {HTMLInputElement} */ (h('input', { type: 'search', class: 'search-input', placeholder: 'Search by clan name, tag or description', 'aria-label': 'Search clans', value: state.q, autocomplete: 'off', maxlength: 40 }));
  const typeToggles = CLAN_TYPES.map((t) => ({ key: t.key, t: toggle({ label: t.label, hint: t.hint, checked: state.type.includes(t.key), onChange: () => { state.type = typeToggles.filter((x) => x.t.input.checked).map((x) => x.key); apply(); } }) }));
  const language = field({ label: 'Language', name: 'language', type: 'select', value: state.language, options: [anyOpt('Any language'), ...LANGUAGES.map((l) => ({ value: l.key, label: l.label }))] });
  const war = field({ label: 'War frequency', name: 'war', type: 'select', value: state.war, options: [anyOpt('Any'), ...WAR_FREQUENCIES.map((w) => ({ value: w.key, label: w.label }))] });
  const focus = field({ label: 'Focus', name: 'focus', type: 'select', value: state.focus, options: [anyOpt('Any focus'), ...FOCUSES.map((f) => ({ value: f.key, label: f.label }))] });
  const th = field({ label: 'My Town Hall', name: 'th', type: 'select', value: state.th, hint: 'Only show clans that accept this Town Hall.',
    options: [anyOpt('Any'), ...Array.from({ length: MAX_TH }, (_, i) => ({ value: String(MAX_TH - i), label: `Town Hall ${MAX_TH - i}` }))] });
  const trophies = field({ label: 'My trophies', name: 'trophies', type: 'number', value: state.trophies, inputmode: 'numeric', min: 0, max: 10000, placeholder: 'e.g. 2400', hint: 'Hides clans that require more.' });
  const slots = toggle({ label: 'Has free slots', checked: state.slots, onChange: (v) => { state.slots = v; apply(); } });
  const qualify = me ? toggle({ label: 'Clans I qualify for', hint: 'Uses the Town Hall and trophies from your profile.', checked: state.qualify, onChange: (v) => { state.qualify = v; apply(); } }) : null;
  const sort = field({ label: 'Sort by', name: 'sort', type: 'select', value: state.sort, options: SORTS });

  for (const [f, key] of /** @type {const} */ ([[language, 'language'], [war, 'war'], [focus, 'focus'], [th, 'th'], [sort, 'sort']])) {
    f.input.addEventListener('change', () => { state[key] = f.input.value; apply(); });
  }
  trophies.input.addEventListener('input', () => { state.trophies = trophies.input.value; apply(true); });
  search.addEventListener('input', () => { state.q = search.value; apply(true); });

  const filterPanel = h('aside', { class: 'filters card', id: 'filters', 'aria-label': 'Clan filters' },
    h('div', { class: 'filters-head' }, h('h2', { class: 'display' }, icon('filter', 20), 'Filters'),
      h('button', { class: 'btn btn-ghost btn-sm filters-close', type: 'button', 'aria-label': 'Close filters', onclick: () => toggleSheet(false) }, icon('close', 18))),
    h('fieldset', { class: 'fieldset' }, h('legend', null, 'Recruiting'), ...typeToggles.map((x) => x.t.el)),
    language.el, war.el, focus.el, th.el, trophies.el,
    h('div', { class: 'fieldset' }, slots.el, qualify?.el),
    h('div', { class: 'filters-foot' }, btn('Clear all', { variant: 'ghost', onClick: () => reset() }), btn('Show results', { variant: 'primary', cls: 'show-results', onClick: () => toggleSheet(false) })));
  const overlay = h('div', { class: 'sheet-overlay', hidden: true, onclick: () => toggleSheet(false) });
  const filterBtn = h('button', { class: 'btn btn-secondary filter-btn', type: 'button', 'aria-controls': 'filters', 'aria-expanded': 'false', onclick: () => toggleSheet(true) }, icon('filter', 18), h('span', null, 'Filters'), h('span', { class: 'tab-badge', hidden: true }));

  /** @param {boolean} open */
  function toggleSheet(open) {
    filterPanel.classList.toggle('is-open', open); overlay.hidden = !open; filterBtn.setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('no-scroll', open);
    if (open) /** @type {HTMLElement} */ (filterPanel.querySelector('input,select'))?.focus(); else filterBtn.focus();
  }
  const onKey = (/** @type {KeyboardEvent} */ e) => { if (e.key === 'Escape' && filterPanel.classList.contains('is-open')) toggleSheet(false); };
  document.addEventListener('keydown', onKey);

  /* ----- results ----- */
  const count = h('p', { class: 'result-count', 'aria-live': 'polite' }, 'Searching…');
  const chips = h('div', { class: 'chips', 'aria-label': 'Active filters' });
  const grid = h('div', { class: 'grid-cards', 'aria-busy': 'true' });
  const pager = h('div', { class: 'pager' });

  function activeChips() {
    /** @type {{label:string, clear:()=>void}[]} */ const list = [];
    for (const t of state.type) list.push({ label: typeLabel(t), clear: () => { state.type = state.type.filter((x) => x !== t); const tg = typeToggles.find((x) => x.key === t); if (tg) tg.t.input.checked = false; } });
    if (state.language) list.push({ label: langLabel(state.language), clear: () => { state.language = ''; language.input.value = ''; } });
    if (state.war) list.push({ label: warLabel(state.war), clear: () => { state.war = ''; war.input.value = ''; } });
    if (state.focus) list.push({ label: focusLabel(state.focus), clear: () => { state.focus = ''; focus.input.value = ''; } });
    if (state.th) list.push({ label: `TH ${state.th}`, clear: () => { state.th = ''; th.input.value = ''; } });
    if (state.trophies) list.push({ label: `${state.trophies} trophies`, clear: () => { state.trophies = ''; trophies.input.value = ''; } });
    if (state.slots) list.push({ label: 'Free slots', clear: () => { state.slots = false; slots.input.checked = false; } });
    if (state.qualify) list.push({ label: 'I qualify', clear: () => { state.qualify = false; if (qualify) qualify.input.checked = false; } });
    return list;
  }

  function paint() {
    const list = activeChips();
    mount(chips, ...list.map((c) => h('button', { class: 'chip', type: 'button', 'aria-label': `Remove filter ${c.label}`, onclick: () => { c.clear(); apply(); } }, c.label, icon('close', 14))),
      list.length ? h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: reset }, 'Clear all') : null);
    const badge = /** @type {HTMLElement} */ (filterBtn.querySelector('.tab-badge'));
    badge.hidden = !list.length; badge.textContent = String(list.length);
  }

  function reset() {
    Object.assign(state, { q: '', type: [], language: '', war: '', focus: '', th: '', trophies: '', slots: false, qualify: false, page: 1 });
    search.value = ''; language.input.value = ''; war.input.value = ''; focus.input.value = ''; th.input.value = ''; trophies.input.value = '';
    for (const x of typeToggles) x.t.input.checked = false;
    slots.input.checked = false; if (qualify) qualify.input.checked = false;
    apply();
  }

  /** @param {boolean} [debounce] */
  function apply(debounce = false) {
    state.page = 1;
    clearTimeout(timer);
    timer = setTimeout(load, debounce ? 350 : 0);
  }

  function writeUrl() {
    ctx.setQuery({ q: state.q.trim(), type: state.type.join(','), language: state.language, war: state.war, focus: state.focus, th: state.th, trophies: state.trophies,
      slots: state.slots ? '1' : '', qualify: state.qualify ? '1' : '', sort: state.sort === 'match' ? '' : state.sort, page: state.page > 1 ? String(state.page) : '' });
  }

  async function load() {
    const id = ++reqId;
    writeUrl(); paint();
    grid.setAttribute('aria-busy', 'true');
    mount(grid, ...skeletons(6));
    mount(pager);
    try {
      const r = await get(`/clans${qs({ q: state.q.trim(), type: state.type.join(','), language: state.language, war: state.war, focus: state.focus, th: state.th, trophies: state.trophies,
        slots: state.slots, qualify: state.qualify, sort: state.sort, page: state.page > 1 ? state.page : '', pageSize: 12 })}`);
      if (id !== reqId || !ctx.alive()) return;
      count.textContent = r.total === 0 ? 'No clans found' : `${r.total} ${r.total === 1 ? 'clan' : 'clans'} found`;
      if (!r.items.length) {
        const filtered = activeChips().length > 0 || state.q.trim() !== '';
        mount(grid, h('div', { class: 'span-all' }, emptyState(filtered
          ? { icon: 'search', title: 'No clans match these filters', text: 'Try removing a filter or searching with fewer words.', actions: [btn('Clear all filters', { variant: 'primary', onClick: reset }), btn('Found your own clan', { href: me ? '/clans/new' : '/register', icon: 'plus' })] }
          : { icon: 'shield', title: 'No clans yet', text: 'CoCekIn is brand new. Be the first to found a clan.', actions: [btn('Found a clan', { variant: 'primary', href: me ? '/clans/new' : '/register', icon: 'plus' })] })));
      } else mount(grid, ...r.items.map(clanCard));
      mount(pager, pagination({ page: r.page, pages: r.pages, onPage: (p) => { state.page = p; load(); window.scrollTo({ top: 0, behavior: 'smooth' }); } }));
    } catch (e) {
      if (id !== reqId || !ctx.alive()) return;
      count.textContent = 'Could not load clans';
      mount(grid, h('div', { class: 'span-all' }, errorState(e, load)));
    } finally { if (id === reqId) grid.removeAttribute('aria-busy'); }
  }

  mount(ctx.root, h('section', { class: 'container page' },
    h('header', { class: 'page-head' },
      h('p', { class: 'eyebrow' }, 'Clan discovery'), h('h1', { class: 'display' }, 'Find a clan that fits your village'),
      h('p', { class: 'lead' }, 'Search every clan on CoCekIn and filter by what actually matters. We tell you at a glance whether you meet the requirements.'),
      h('form', { class: 'searchbar', role: 'search', onsubmit: (/** @type {Event} */ e) => { e.preventDefault(); apply(); } }, icon('search', 20), search, h('button', { class: 'btn btn-primary', type: 'submit' }, 'Search'))),
    h('div', { class: 'discover' }, filterPanel, overlay,
      h('div', { class: 'results' },
        h('div', { class: 'toolbar' }, count, h('div', { class: 'toolbar-right' }, filterBtn, h('div', { class: 'sort-inline' }, sort.el))),
        chips, grid, pager))));
  load();
  return () => { clearTimeout(timer); document.removeEventListener('keydown', onKey); document.body.classList.remove('no-scroll'); reqId++; };
}

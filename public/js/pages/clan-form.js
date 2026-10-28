import { h, icon, mount } from '../dom.js';
import { post } from '../api.js';
import { refreshMe, session } from '../state.js';
import { navigate } from '../router.js';
import { clanBadge, cover } from '../art.js';
import { btn, busy, emptyState, errMsg, field, picker, showFieldErrors, toast } from '../ui.js';
import { CLAN_TYPES, COVERS, EMBLEMS, FOCUSES, LANGUAGES, MAX_TH, PALETTE, WAR_FREQUENCIES } from '../../../shared/game.js';
import { clanCard } from '../components.js';

/**
 * Shared clan form used when founding a clan and when editing one.
 * @param {Partial<{name:string,tag:string|null,description:string,type:string,minTh:number,minTrophies:number,language:string,warFrequency:string,focus:string,emblem:string,color:string,banner:string}>} init
 * @param {(preview:any)=>void} [onPreview]
 */
export function clanForm(init = {}, onPreview) {
  const v = { type: 'open', minTh: 1, minTrophies: 0, language: 'en', warFrequency: 'twice_week', focus: 'casual', emblem: 'shield', color: 'gold', banner: 'sunset-keep', name: '', tag: '', description: '', ...init };
  const fields = {
    name: field({ label: 'Clan name', name: 'name', value: v.name, required: true, maxlength: 30, autocomplete: 'off', hint: '3–30 characters. Letters, numbers, spaces and . _ - only.' }),
    tag: field({ label: 'In-game clan tag (optional)', name: 'tag', value: v.tag ?? '', maxlength: 14, autocomplete: 'off', placeholder: '#2YG9RQ', hint: 'Helps players find you in the game. Not verified.' }),
    description: field({ label: 'Description', name: 'description', type: 'textarea', value: v.description, rows: 4, maxlength: 300, hint: 'What is your clan about? Activity, expectations, war style.' }),
    minTh: field({ label: 'Minimum Town Hall', name: 'minTh', type: 'select', value: String(v.minTh), options: Array.from({ length: MAX_TH }, (_, i) => ({ value: String(i + 1), label: i === 0 ? 'Any Town Hall' : `Town Hall ${i + 1}+` })) }),
    minTrophies: field({ label: 'Minimum trophies', name: 'minTrophies', type: 'number', value: v.minTrophies, inputmode: 'numeric', min: 0, max: 10000 }),
    language: field({ label: 'Main language', name: 'language', type: 'select', value: v.language, options: LANGUAGES.map((l) => ({ value: l.key, label: l.label })) }),
    warFrequency: field({ label: 'War frequency', name: 'warFrequency', type: 'select', value: v.warFrequency, options: WAR_FREQUENCIES.map((w) => ({ value: w.key, label: w.label })) }),
    focus: field({ label: 'Clan focus', name: 'focus', type: 'select', value: v.focus, options: FOCUSES.map((f) => ({ value: f.key, label: f.label })) }),
  };
  const typePick = picker({ legend: 'Who can join?', name: 'type', value: v.type, cls: 'picker-type', onChange: () => changed(),
    options: CLAN_TYPES.map((t) => ({ value: t.key, label: t.label, face: () => h('span', { class: 'type-face' }, h('strong', null, t.label), h('small', null, t.hint)) })) });
  const emblemPick = picker({ legend: 'Emblem', name: 'emblem', value: v.emblem, cls: 'picker-grid', onChange: () => changed(),
    options: EMBLEMS.map((e) => ({ value: e, label: e, face: () => clanBadge(e, 'gold', 44, '') })) });
  const colorPick = picker({ legend: 'Badge colour', name: 'color', value: v.color, cls: 'picker-swatch', onChange: () => changed(),
    options: Object.keys(PALETTE).map((c) => ({ value: c, label: c, face: () => h('span', { class: 'swatch', style: { '--c1': PALETTE[/** @type {keyof typeof PALETTE} */ (c)][0], '--c2': PALETTE[/** @type {keyof typeof PALETTE} */ (c)][1] } }) })) });
  const bannerPick = picker({ legend: 'Banner scene', name: 'banner', value: v.banner, cls: 'picker-covers', onChange: () => changed(),
    options: COVERS.map((c) => ({ value: c.key, label: c.label, face: () => h('span', { class: 'cover-thumb' }, cover(c.key), h('small', null, c.label)) })) });

  /** The values in API shape. */
  function values() {
    return {
      name: fields.name.value.trim(), tag: fields.tag.value.trim() || null, description: fields.description.value.trim(), type: typePick.value,
      minTh: Number(fields.minTh.value), minTrophies: fields.minTrophies.value === '' ? 0 : Number(fields.minTrophies.value), language: fields.language.value,
      warFrequency: fields.warFrequency.value, focus: fields.focus.value, emblem: emblemPick.value, color: colorPick.value, banner: bannerPick.value,
    };
  }
  function changed() { onPreview?.(values()); }
  for (const f of Object.values(fields)) { f.input.addEventListener('input', changed); f.input.addEventListener('change', changed); }

  const el = h('div', { class: 'form-sections' },
    h('div', { class: 'form-section' }, h('h3', { class: 'display' }, 'Identity'), fields.name.el, fields.tag.el, fields.description.el),
    h('div', { class: 'form-section' }, h('h3', { class: 'display' }, 'Recruiting'), typePick.el, h('div', { class: 'form-row' }, fields.minTh.el, fields.minTrophies.el)),
    h('div', { class: 'form-section' }, h('h3', { class: 'display' }, 'Play style'), h('div', { class: 'form-row' }, fields.language.el, fields.warFrequency.el, fields.focus.el)),
    h('div', { class: 'form-section' }, h('h3', { class: 'display' }, 'Look'), emblemPick.el, colorPick.el, bannerPick.el));
  return { el, fields, values, errors: (/** @type {unknown} */ e) => showFieldErrors(fields, e) };
}

/** @param {any} v */
export function previewClan(v) {
  return { slug: 'preview', name: v.name || 'Your clan name', tag: v.tag, description: v.description || 'Your description will appear here.', type: v.type, minTh: v.minTh || 1, minTrophies: v.minTrophies || 0,
    language: v.language, warFrequency: v.warFrequency, focus: v.focus, emblem: v.emblem, color: v.color, banner: v.banner, isDemo: false,
    stats: { members: 1, capacity: 50, avgTh: session.me?.thLevel ?? null, totalTrophies: session.me?.trophies ?? 0, totalWarStars: 0 }, fit: null };
}

/** @param {import('../router.js').PageCtx} ctx */
export default function clanFormPage(ctx) {
  ctx.setTitle('Found a clan');
  const me = session.me;
  if (me?.clan) {
    mount(ctx.root, h('section', { class: 'container page-state' }, emptyState({ icon: 'shield', title: 'You are already in a clan', text: `Leave ${me.clan.name} before founding a new one.`, actions: [btn('Go to my clan', { variant: 'primary', href: `/clans/${me.clan.slug}` })] })));
    return;
  }
  const previewHost = h('div', { class: 'preview-host' });
  const paint = (/** @type {any} */ v) => { mount(previewHost, clanCard(previewClan(v))); previewHost.querySelectorAll('a').forEach((a) => { a.setAttribute('tabindex', '-1'); a.setAttribute('aria-disabled', 'true'); a.addEventListener('click', (e) => e.preventDefault()); }); };
  const form = clanForm({}, paint);
  paint(form.values());
  const formError = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const submit = h('button', { class: 'btn btn-primary btn-lg', type: 'submit' }, icon('shield', 20), h('span', null, 'Found my clan'));
  const el = h('form', { class: 'card pad', novalidate: true, onsubmit: async (/** @type {Event} */ e) => {
    e.preventDefault(); formError.hidden = true;
    await busy(submit, async () => {
      try {
        const r = await post('/clans', form.values());
        await refreshMe();
        toast(`${r.clan.name} is founded. You are the leader!`, 'success');
        navigate(`/clans/${r.clan.slug}`);
      } catch (err) { if (!form.errors(err)) { formError.textContent = errMsg(err); formError.hidden = false; } }
    });
  } }, form.el, formError, h('div', { class: 'form-actions' }, btn('Cancel', { variant: 'ghost', href: '/clans' }), submit));
  mount(ctx.root, h('section', { class: 'container page' },
    h('header', { class: 'page-head' }, h('p', { class: 'eyebrow' }, 'New clan'), h('h1', { class: 'display' }, 'Found your clan'), h('p', { class: 'lead' }, 'Set your requirements and style. You can change everything later.')),
    h('div', { class: 'two-col' }, el, h('aside', { class: 'sticky-col', 'aria-label': 'Live preview' }, h('h2', { class: 'display card-title' }, icon('eye', 20), 'Live preview'), previewHost))));
}

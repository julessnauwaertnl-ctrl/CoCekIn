// Reusable UI building blocks: toasts, buttons, forms, dialogs, tabs, states.
import { h, icon, mount } from './dom.js';
import { ApiError } from './api.js';

let seq = 0;
export const uid = (/** @type {string} */ p) => `${p}-${++seq}`;

/* ---------- Toasts ---------- */
/** @param {string} message @param {'success'|'error'|'info'} [kind] */
export function toast(message, kind = 'info') {
  const host = document.getElementById('toasts');
  if (!host) return;
  const el = h('div', { class: `toast toast-${kind}`, role: kind === 'error' ? 'alert' : 'status' },
    icon(kind === 'success' ? 'check' : kind === 'error' ? 'alert' : 'info', 18),
    h('span', null, message),
    h('button', { class: 'toast-x', type: 'button', 'aria-label': 'Dismiss notification', onclick: () => el.remove() }, icon('close', 16)));
  host.appendChild(el);
  setTimeout(() => el.remove(), kind === 'error' ? 8000 : 4500);
}

/** @param {unknown} e @param {string} [fallback] */
export const errMsg = (e, fallback = 'Something went wrong. Please try again.') => (e instanceof ApiError ? e.message : fallback);

/* ---------- Buttons ---------- */
/**
 * @param {string} label
 * @param {{variant?:'primary'|'secondary'|'ghost'|'danger', icon?:string, href?:string, onClick?:(e:Event)=>any, type?:string, size?:'sm'|'lg', block?:boolean, disabled?:boolean, label?:string, cls?:string}} [o]
 */
export function btn(label, o = {}) {
  const cls = `btn btn-${o.variant || 'secondary'}${o.size ? ` btn-${o.size}` : ''}${o.block ? ' btn-block' : ''}${o.cls ? ` ${o.cls}` : ''}`;
  const kids = [o.icon ? icon(o.icon, o.size === 'sm' ? 16 : 18) : null, h('span', null, label)];
  if (o.href) return h('a', { class: cls, href: o.href, 'aria-label': o.label }, ...kids);
  return h('button', { class: cls, type: o.type || 'button', disabled: o.disabled, onclick: o.onClick, 'aria-label': o.label }, ...kids);
}

/**
 * Disable a button and show a spinner while fn runs.
 * @template T @param {HTMLElement} button @param {() => Promise<T>} fn @returns {Promise<T>}
 */
export async function busy(button, fn) {
  const was = /** @type {HTMLButtonElement} */ (button);
  was.disabled = true; was.setAttribute('aria-busy', 'true'); was.classList.add('is-busy');
  try { return await fn(); } finally { was.disabled = false; was.removeAttribute('aria-busy'); was.classList.remove('is-busy'); }
}

/* ---------- States ---------- */
/** @param {{icon?:string, title:string, text?:string, actions?:any[]}} o */
export function emptyState(o) {
  return h('div', { class: 'state-card' },
    h('div', { class: 'state-icon' }, icon(o.icon || 'shield', 34)),
    h('h3', { class: 'display state-title' }, o.title),
    o.text ? h('p', null, o.text) : null,
    o.actions?.length ? h('div', { class: 'state-actions' }, ...o.actions) : null);
}

/** @param {unknown} err @param {() => void} retry */
export function errorState(err, retry) {
  return h('div', { class: 'state-card state-error', role: 'alert' },
    h('div', { class: 'state-icon' }, icon('alert', 34)),
    h('h3', { class: 'display state-title' }, err instanceof ApiError && err.code === 'network' ? 'You seem to be offline' : 'We hit a snag'),
    h('p', null, errMsg(err)),
    h('div', { class: 'state-actions' }, btn('Try again', { variant: 'primary', icon: 'refresh', onClick: retry })));
}

/** @param {number} n @param {'card'|'row'} [kind] */
export function skeletons(n, kind = 'card') {
  return Array.from({ length: n }, () => h('div', { class: `skeleton sk-${kind}`, 'aria-hidden': 'true' },
    h('div', { class: 'sk sk-circle' }), h('div', { class: 'sk-lines' }, h('div', { class: 'sk sk-line w60' }), h('div', { class: 'sk sk-line w90' }), h('div', { class: 'sk sk-line w40' }))));
}

/* ---------- Forms ---------- */
/**
 * @typedef {{ el:HTMLElement, input:any, readonly value:string, setError:(m?:string|null)=>void }} Field
 * @param {{label:string, name:string, type?:string, value?:string|number|null, hint?:string, required?:boolean, autocomplete?:string, maxlength?:number, rows?:number, options?:{value:string,label:string}[], placeholder?:string, inputmode?:string, min?:number, max?:number, disabled?:boolean}} o
 * @returns {Field}
 */
export function field(o) {
  const id = uid(`f-${o.name}`);
  const type = o.type || 'text';
  const common = { id, name: o.name, required: o.required, autocomplete: o.autocomplete, placeholder: o.placeholder, disabled: o.disabled, 'aria-describedby': `${id}-hint ${id}-err` };
  /** @type {any} */ let input;
  if (type === 'textarea') input = h('textarea', { ...common, rows: o.rows || 4, maxlength: o.maxlength, value: o.value ?? '' });
  else if (type === 'select') input = h('select', { ...common, value: o.value == null ? '' : String(o.value) }, ...(o.options || []).map((x) => h('option', { value: x.value }, x.label)));
  else input = h('input', { ...common, type, maxlength: o.maxlength, inputmode: o.inputmode, min: o.min, max: o.max, value: o.value ?? '' });
  const err = h('p', { class: 'field-error', id: `${id}-err`, hidden: true });
  const hint = h('p', { class: 'field-hint', id: `${id}-hint`, hidden: !o.hint }, o.hint || '');
  /** @type {any[]} */ let control = [input];
  if (type === 'password') {
    const toggle = h('button', { class: 'field-toggle', type: 'button', 'aria-label': 'Show password', 'aria-pressed': 'false', onclick: () => {
      const show = input.type === 'password'; input.type = show ? 'text' : 'password';
      toggle.setAttribute('aria-pressed', String(show)); toggle.setAttribute('aria-label', show ? 'Hide password' : 'Show password'); toggle.textContent = show ? 'Hide' : 'Show';
    } }, 'Show');
    control = [h('div', { class: 'field-pw' }, input, toggle)];
  }
  const el = h('div', { class: 'field' }, h('label', { for: id }, o.label, o.required ? h('span', { class: 'req', 'aria-hidden': 'true' }, ' *') : null), ...control, hint, err);
  return {
    el, input,
    get value() { return input.value; },
    setError(m) {
      err.textContent = m || ''; err.hidden = !m;
      if (m) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
    },
  };
}

/** Apply API validation errors to fields and focus the first one. @param {Record<string,Field>} fields @param {unknown} e @returns {boolean} true when handled */
export function showFieldErrors(fields, e) {
  for (const f of Object.values(fields)) f.setError(null);
  if (!(e instanceof ApiError) || !Object.keys(e.fields).length) return false;
  let first = true; let any = false;
  for (const [k, m] of Object.entries(e.fields)) {
    const f = fields[k]; if (!f) continue;
    f.setError(m); any = true;
    if (first) { f.input.focus(); first = false; }
  }
  return any;
}

/** @param {{label:string, checked?:boolean, hint?:string, onChange?:(v:boolean)=>void}} o */
export function toggle(o) {
  const id = uid('tg');
  const input = h('input', { type: 'checkbox', id, checked: !!o.checked, class: 'switch-input', onchange: () => o.onChange?.(/** @type {HTMLInputElement} */ (input).checked) });
  const el = h('label', { class: 'switch', for: id }, input, h('span', { class: 'switch-track', 'aria-hidden': 'true' }), h('span', { class: 'switch-label' }, o.label, o.hint ? h('small', null, o.hint) : null));
  return { el, input: /** @type {HTMLInputElement} */ (input) };
}

/* ---------- Dialogs ---------- */
/**
 * Confirm dialog. Resolves to true/false, or to the typed text when `typeToConfirm` is given (empty string when cancelled).
 * @param {{title:string, body:string|Node, confirmLabel?:string, danger?:boolean, typeToConfirm?:string, textarea?:{label:string, maxlength:number, hint?:string}}} o
 * @returns {Promise<boolean|string>}
 */
export function confirmDialog(o) {
  return new Promise((resolve) => {
    const prev = /** @type {HTMLElement|null} */ (document.activeElement);
    const dlg = /** @type {HTMLDialogElement} */ (h('dialog', { class: 'modal', 'aria-labelledby': 'dlg-title' }));
    /** @type {Field|null} */ let f = null;
    if (o.typeToConfirm) f = field({ label: `Type “${o.typeToConfirm}” to confirm`, name: 'confirm', autocomplete: 'off' });
    else if (o.textarea) f = field({ label: o.textarea.label, name: 'message', type: 'textarea', rows: 3, maxlength: o.textarea.maxlength, hint: o.textarea.hint });
    const ok = h('button', { class: `btn ${o.danger ? 'btn-danger' : 'btn-primary'}`, type: 'submit', value: 'ok' }, o.confirmLabel || 'Confirm');
    const form = h('form', { method: 'dialog', class: 'modal-body' },
      h('h2', { id: 'dlg-title', class: 'display' }, o.title),
      typeof o.body === 'string' ? h('p', null, o.body) : o.body,
      f ? f.el : null,
      h('div', { class: 'modal-actions' }, h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => dlg.close('cancel') }, 'Cancel'), ok));
    form.addEventListener('submit', (e) => {
      if (o.typeToConfirm && f && f.value.trim().toLowerCase() !== o.typeToConfirm.toLowerCase()) { e.preventDefault(); f.setError('That does not match.'); }
    });
    dlg.appendChild(form);
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close('cancel'); });
    dlg.addEventListener('close', () => {
      const confirmed = dlg.returnValue === 'ok';
      const text = f ? f.value.trim() : '';
      dlg.remove(); prev?.focus?.();
      resolve(o.typeToConfirm || o.textarea ? (confirmed ? (o.textarea ? text || ' ' : text) : (o.textarea ? '' : '')) : confirmed);
    });
    document.body.appendChild(dlg);
    dlg.showModal();
    (f ? f.input : ok).focus();
  });
}

/* ---------- Tabs ---------- */
/**
 * Accessible tabs with arrow-key navigation. Panels are rendered lazily by `render(id)`.
 * @param {{items:{id:string,label:string,icon?:string,badge?:number}[], active:string, render:(id:string, panel:HTMLElement)=>void, onChange?:(id:string)=>void, label:string}} o
 */
export function tabs(o) {
  const base = uid('tabs');
  const panel = h('div', { class: 'tab-panel', role: 'tabpanel', tabindex: '0' });
  const list = h('div', { class: 'tabs', role: 'tablist', 'aria-label': o.label });
  /** @type {HTMLElement[]} */ let buttons = [];
  /** @param {string} id @param {boolean} [focus] */
  function select(id, focus = false) {
    buttons.forEach((b) => {
      const on = b.dataset.id === id;
      b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; b.classList.toggle('is-active', on);
      if (on) { panel.setAttribute('aria-labelledby', b.id); if (focus) b.focus(); }
    });
    mount(panel); o.render(id, panel); o.onChange?.(id);
  }
  buttons = o.items.map((it) => h('button', { class: 'tab', role: 'tab', type: 'button', id: `${base}-${it.id}`, 'data-id': it.id, onclick: () => select(it.id) },
    it.icon ? icon(it.icon, 18) : null, h('span', null, it.label), it.badge ? h('span', { class: 'tab-badge', 'aria-label': `${it.badge} pending` }, it.badge) : null));
  list.addEventListener('keydown', (e) => {
    const i = buttons.findIndex((b) => b.getAttribute('aria-selected') === 'true');
    let n = -1;
    if (e.key === 'ArrowRight') n = (i + 1) % buttons.length; else if (e.key === 'ArrowLeft') n = (i - 1 + buttons.length) % buttons.length;
    else if (e.key === 'Home') n = 0; else if (e.key === 'End') n = buttons.length - 1;
    if (n >= 0) { e.preventDefault(); select(/** @type {string} */ (buttons[n].dataset.id), true); }
  });
  buttons.forEach((b) => list.appendChild(b));
  select(o.items.some((i) => i.id === o.active) ? o.active : o.items[0].id);
  return { list, panel, select };
}

/* ---------- Pagination ---------- */
/** @param {{page:number, pages:number, onPage:(p:number)=>void}} o */
export function pagination(o) {
  if (o.pages <= 1) return h('span');
  /** @type {(number|'…')[]} */ const items = [];
  for (let p = 1; p <= o.pages; p++) if (p === 1 || p === o.pages || Math.abs(p - o.page) <= 1) items.push(p); else if (items[items.length - 1] !== '…') items.push('…');
  return h('nav', { class: 'pagination', 'aria-label': 'Pagination' },
    h('button', { class: 'btn btn-ghost btn-sm', type: 'button', disabled: o.page <= 1, onclick: () => o.onPage(o.page - 1) }, 'Previous'),
    ...items.map((p) => (p === '…' ? h('span', { class: 'page-gap', 'aria-hidden': 'true' }, '…')
      : h('button', { class: `page-num${p === o.page ? ' is-active' : ''}`, type: 'button', 'aria-current': p === o.page ? 'page' : null, 'aria-label': `Page ${p}`, onclick: () => o.onPage(p) }, String(p)))),
    h('button', { class: 'btn btn-ghost btn-sm', type: 'button', disabled: o.page >= o.pages, onclick: () => o.onPage(o.page + 1) }, 'Next'));
}

/** @param {string} text @param {string} [kind] @param {string} [ico] */
export const pill = (text, kind = '', ico = '') => h('span', { class: `pill${kind ? ` pill-${kind}` : ''}` }, ico ? icon(ico, 14) : null, text);

/** @param {string} ico @param {string} label @param {string|number} value @param {string} [sub] */
export const statTile = (ico, label, value, sub) => h('div', { class: 'stat-tile' },
  h('div', { class: 'stat-ico' }, icon(ico, 22)), h('div', null, h('div', { class: 'stat-val display' }, String(value)), h('div', { class: 'stat-label' }, label), sub ? h('div', { class: 'stat-sub' }, sub) : null));

/** @param {string} text */
export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast('Copied to clipboard.', 'success'); } catch { toast('Copy failed. Select the text and copy it manually.', 'error'); }
}

/** @param {number} value @param {number} max @param {string} label */
export const meter = (value, max, label) => h('div', { class: 'meter', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': max, 'aria-valuenow': value, 'aria-label': label },
  h('div', { class: 'meter-fill', style: { width: `${Math.max(0, Math.min(100, (value / max) * 100))}%` } }));

/**
 * Visual radio-group picker (avatars, colours, covers, clan type...). Uses native radios, so keyboard + screen readers just work.
 * @param {{legend:string, name:string, value:string, options:{value:string,label:string,face:()=>Node}[], cls?:string, onChange?:(v:string)=>void}} o
 */
export function picker(o) {
  const labelId = uid('pk');
  const group = h('div', { class: `picker ${o.cls || ''}`.trim(), role: 'radiogroup', 'aria-labelledby': labelId }, h('span', { class: 'picker-label', id: labelId }, o.legend));
  /** @type {HTMLInputElement[]} */ const inputs = [];
  for (const opt of o.options) {
    const input = /** @type {HTMLInputElement} */ (h('input', { type: 'radio', name: o.name, value: opt.value, checked: opt.value === o.value, onchange: () => o.onChange?.(opt.value) }));
    inputs.push(input);
    group.appendChild(h('label', { class: 'pick', title: opt.label }, input, h('span', { class: 'pick-face' }, opt.face()), h('span', { class: 'sr-only' }, opt.label)));
  }
  return { el: group, get value() { return inputs.find((i) => i.checked)?.value ?? o.value; }, set value(v) { for (const i of inputs) i.checked = i.value === v; } };
}

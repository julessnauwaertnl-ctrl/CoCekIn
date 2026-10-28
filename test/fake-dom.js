// A deliberately small DOM implementation, just enough to execute the real frontend code in Node
// (no browser is needed for the smoke test). It is NOT a browser: layout, CSS and real event semantics are not simulated.

/** @param {string} s */ const kebab = (s) => s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

class FNode {
  constructor() { /** @type {any[]} */ this.childNodes = []; /** @type {any} */ this.parentNode = null; /** @type {Record<string, Function[]>} */ this._l = {}; }
  get firstChild() { return this.childNodes[0] ?? null; }
  /** @param {any} c */ appendChild(c) {
    if (c.nodeType === 11) { for (const k of [...c.childNodes]) this.appendChild(k); return c; }
    if (c.parentNode) c.parentNode.removeChild(c);
    c.parentNode = this; this.childNodes.push(c); return c;
  }
  /** @param {any} c */ removeChild(c) { const i = this.childNodes.indexOf(c); if (i >= 0) { this.childNodes.splice(i, 1); c.parentNode = null; } return c; }
  remove() { this.parentNode?.removeChild(this); }
  get isConnected() { let n = /** @type {any} */ (this); while (n.parentNode) n = n.parentNode; return n === globalThis.document; }
  /** @param {any} n */ contains(n) { for (let x = n; x; x = x.parentNode) if (x === this) return true; return false; }
  /** @param {string} t @param {Function} fn */ addEventListener(t, fn) { (this._l[t] ||= []).push(fn); }
  /** @param {string} t @param {Function} fn */ removeEventListener(t, fn) { this._l[t] = (this._l[t] || []).filter((f) => f !== fn); }
  /** @param {any} ev */ dispatchEvent(ev) {
    ev.target ??= this; ev.defaultPrevented ??= false;
    ev.preventDefault ??= function () { this.defaultPrevented = true; }; ev.stopPropagation ??= function () { this.cancelBubble = true; };
    for (let n = /** @type {any} */ (this); n; n = n.parentNode) {
      ev.currentTarget = n;
      for (const fn of [...(n._l?.[ev.type] || [])]) fn.call(n, ev);
      if (ev.cancelBubble || ev.bubbles === false) break;
    }
    return !ev.defaultPrevented;
  }
  get textContent() { return this.childNodes.map((c) => c.textContent).join(''); }
  set textContent(v) { this.childNodes = []; if (v !== '' && v != null) this.appendChild(new FText(String(v))); }
}
class FText extends FNode { /** @param {string} d */ constructor(d) { super(); this.nodeType = 3; this.data = d; } get textContent() { return this.data; } set textContent(v) { this.data = v; } }
class FFragment extends FNode { constructor() { super(); this.nodeType = 11; } }

/** @param {string} sel @param {any} el */
function matchesOne(sel, el) {
  if (el.nodeType !== 1) return false;
  const re = /(^[a-zA-Z][\w-]*)|(#[\w-]+)|(\.[\w-]+)|(\[[^\]]+\])/g;
  let m; let any = false;
  while ((m = re.exec(sel))) {
    any = true; const t = m[0];
    if (t[0] === '#') { if (el.getAttribute('id') !== t.slice(1)) return false; }
    else if (t[0] === '.') { if (!el.classList.contains(t.slice(1))) return false; }
    else if (t[0] === '[') {
      const [k, v] = t.slice(1, -1).split('='); const a = el.getAttribute(k);
      if (a == null || (v !== undefined && a !== v.replace(/^["']|["']$/g, ''))) return false;
    } else if (el.tagName.toLowerCase() !== t.toLowerCase()) return false;
  }
  return any;
}

class FElement extends FNode {
  /** @param {string} tag */
  constructor(tag) {
    super(); this.nodeType = 1; this.localName = tag; this.tagName = tag.toUpperCase(); /** @type {Map<string,string>} */ this.attrs = new Map();
    this.style = { setProperty: (/** @type {string} */ k, /** @type {string} */ v) => { /** @type {any} */ (this.style)[k] = v; } };
    this.returnValue = '';
    const self = this;
    this.dataset = new Proxy({}, { get: (_t, k) => self.getAttribute(`data-${kebab(String(k))}`) ?? undefined, set: (_t, k, v) => { self.setAttribute(`data-${kebab(String(k))}`, v); return true; } });
  }
  /** @param {string} k @param {any} v */ setAttribute(k, v) { this.attrs.set(k, String(v)); }
  /** @param {string} k */ getAttribute(k) { return this.attrs.has(k) ? /** @type {string} */ (this.attrs.get(k)) : null; }
  /** @param {string} k */ removeAttribute(k) { this.attrs.delete(k); }
  /** @param {string} k */ hasAttribute(k) { return this.attrs.has(k); }
  get id() { return this.getAttribute('id') ?? ''; } set id(v) { this.setAttribute('id', v); }
  get className() { return this.getAttribute('class') ?? ''; } set className(v) { this.setAttribute('class', v); }
  get type() { return this.getAttribute('type') ?? (this.tagName === 'BUTTON' ? 'submit' : 'text'); } set type(v) { this.setAttribute('type', v); }
  get target() { return this.getAttribute('target') ?? ''; }
  get href() { return this.getAttribute('href') ?? ''; }
  get hidden() { return this.hasAttribute('hidden'); } set hidden(v) { if (v) this.setAttribute('hidden', ''); else this.removeAttribute('hidden'); }
  get tabIndex() { return Number(this.getAttribute('tabindex') ?? -1); } set tabIndex(v) { this.setAttribute('tabindex', v); }
  get classList() {
    const self = this; const get = () => self.className.split(/\s+/).filter(Boolean);
    return {
      add: (/** @type {string[]} */ ...c) => self.setAttribute('class', [...new Set([...get(), ...c])].join(' ')),
      remove: (/** @type {string[]} */ ...c) => self.setAttribute('class', get().filter((x) => !c.includes(x)).join(' ')),
      contains: (/** @type {string} */ c) => get().includes(c),
      toggle(/** @type {string} */ c, /** @type {boolean|undefined} */ force) { const on = force ?? !get().includes(c); if (on) this.add(c); else this.remove(c); return on; },
    };
  }
  /** @param {string} sel */ matches(sel) { return sel.split(',').some((s) => matchesOne(s.trim(), this)); }
  /** @param {string} sel */ closest(sel) { for (let n = /** @type {any} */ (this); n && n.nodeType === 1; n = n.parentNode) if (n.matches(sel)) return n; return null; }
  /** Supports comma lists and descendant combinators (space). @param {string} sel @returns {any[]} */
  querySelectorAll(sel) {
    const alts = sel.split(',').map((x) => x.trim().split(/\s+/));
    const test = (/** @type {any} */ n) => alts.some((parts) => {
      if (!matchesOne(parts[parts.length - 1], n)) return false;
      let i = parts.length - 2; let a = n.parentNode;
      while (i >= 0 && a && a !== this.parentNode) { if (a.nodeType === 1 && matchesOne(parts[i], a)) i--; a = a.parentNode; }
      return i < 0;
    });
    const out = /** @type {any[]} */ ([]);
    const walk = (/** @type {any} */ n) => { for (const c of n.childNodes) { if (c.nodeType === 1) { if (test(c)) out.push(c); walk(c); } } };
    walk(this); return out;
  }
  /** @param {string} sel */ querySelector(sel) { return this.querySelectorAll(sel)[0] ?? null; }
  focus() { /** @type {any} */ (globalThis.document).activeElement = this; }
  blur() { /* noop */ }
  showModal() { this.setAttribute('open', ''); }
  /** @param {string} [rv] */ close(rv) { if (rv !== undefined) this.returnValue = rv; this.removeAttribute('open'); this.dispatchEvent({ type: 'close', bubbles: false }); }
  click() {
    if (this.hasAttribute('disabled') || /** @type {any} */ (this).disabled) return;
    if (this.tagName === 'INPUT' && this.type === 'checkbox') { /** @type {any} */ (this).checked = !/** @type {any} */ (this).checked; this.dispatchEvent({ type: 'change', bubbles: true }); }
    if (this.tagName === 'INPUT' && this.type === 'radio') { /** @type {any} */ (this).checked = true; this.dispatchEvent({ type: 'change', bubbles: true }); }
    const ok = this.dispatchEvent({ type: 'click', bubbles: true, button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false });
    if (ok && this.tagName === 'BUTTON' && this.type === 'submit') {
      const form = this.closest('form');
      if (form) { form.requestSubmit(this); }
    }
  }
  /** @param {any} [submitter] */ requestSubmit(submitter) {
    const ok = this.dispatchEvent({ type: 'submit', bubbles: true, submitter });
    if (ok && this.getAttribute('method') === 'dialog') this.closest('dialog')?.close(submitter?.value ?? '');
  }
}

export function installFakeDom(/** @type {{url:string}} */ { url }) {
  const g = /** @type {any} */ (globalThis);
  const doc = new FElement('#document'); doc.nodeType = 9;
  const body = new FElement('body'); doc.appendChild(body);
  Object.assign(doc, {
    body, activeElement: body, title: '',
    createElement: (/** @type {string} */ t) => new FElement(t),
    createElementNS: (/** @type {string} */ _ns, /** @type {string} */ t) => new FElement(t),
    createTextNode: (/** @type {string} */ d) => new FText(d),
    createDocumentFragment: () => new FFragment(),
    getElementById: (/** @type {string} */ id) => body.querySelector(`#${id}`),
  });
  const loc = new URL(url);
  const location = { get pathname() { return loc.pathname; }, get search() { return loc.search; }, get origin() { return loc.origin; }, get href() { return loc.href; } };
  /** @type {string[]} */ const log = [];
  const history = {
    pushState: (/** @type {any} */ _s, /** @type {string} */ _t, /** @type {string} */ u) => { const n = new URL(u, loc.href); loc.pathname = n.pathname; loc.search = n.search; log.push(`push ${u}`); },
    replaceState: (/** @type {any} */ _s, /** @type {string} */ _t, /** @type {string} */ u) => { const n = new URL(u, loc.href); loc.pathname = n.pathname; loc.search = n.search; log.push(`replace ${u}`); },
  };
  const win = new FNode(); Object.assign(win, { scrollTo() {}, document: doc, location, history });
  g.document = doc; g.window = win; g.history = history; g.location = location;
  Object.defineProperty(g, 'navigator', { value: { clipboard: { writeText: async () => {} } }, configurable: true });
  g.requestAnimationFrame = (/** @type {Function} */ f) => setTimeout(f, 0);
  return { doc, body, history: log, loc };
}

/** @param {string} tag */ export const el = (tag) => new FElement(tag);

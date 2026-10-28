import { HttpError } from './errors.js';

// eslint-disable-next-line no-control-regex
const CTRL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export class Validator {
  /** @param {unknown} input */
  constructor(input) {
    /** @type {Record<string, any>} */
    this.input = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
    /** @type {Record<string,string>} */
    this.errors = {};
    /** @type {Record<string, any>} */
    this.out = {};
  }

  /** @param {string} k */
  has(k) { return Object.hasOwn(this.input, k) && this.input[k] !== undefined; }

  /** @param {string} k @param {string} msg */
  fail(k, msg) { this.errors[k] = msg; }

  /**
   * @param {string} k
   * @param {{min?:number,max?:number,required?:boolean,pattern?:RegExp,patternMsg?:string,label?:string,lower?:boolean,multiline?:boolean,nullable?:boolean}} [o]
   */
  string(k, o = {}) {
    const { min = 0, max = 255, required = true, pattern, patternMsg, label = k, lower = false, multiline = false, nullable = false } = o;
    if (!this.has(k)) { if (required) this.fail(k, `${label} is required.`); return this; }
    const raw = this.input[k];
    if (raw === null && nullable) { this.out[k] = null; return this; }
    if (typeof raw !== 'string') { this.fail(k, `${label} must be text.`); return this; }
    let s = raw.replace(CTRL, '');
    s = multiline ? s.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim() : s.replace(/\s+/g, ' ').trim();
    if (lower) s = s.toLowerCase();
    if (s === '' && nullable) { this.out[k] = null; return this; }
    if (s.length < min) this.fail(k, min === 1 ? `${label} is required.` : `${label} must be at least ${min} characters.`);
    else if (s.length > max) this.fail(k, `${label} must be at most ${max} characters.`);
    else if (pattern && !pattern.test(s)) this.fail(k, patternMsg || `${label} is not valid.`);
    else this.out[k] = s;
    return this;
  }

  /**
   * @param {string} k
   * @param {{min:number,max:number,required?:boolean,nullable?:boolean,label?:string}} o
   */
  int(k, o) {
    const { min, max, required = true, nullable = false, label = k } = o;
    if (!this.has(k)) { if (required) this.fail(k, `${label} is required.`); return this; }
    const raw = this.input[k];
    if ((raw === null || raw === '') && nullable) { this.out[k] = null; return this; }
    const n = typeof raw === 'number' ? raw : typeof raw === 'string' && /^-?\d+$/.test(raw.trim()) ? Number(raw) : NaN;
    if (!Number.isInteger(n)) this.fail(k, `${label} must be a whole number.`);
    else if (n < min || n > max) this.fail(k, `${label} must be between ${min} and ${max}.`);
    else this.out[k] = n;
    return this;
  }

  /**
   * @param {string} k @param {readonly string[]} allowed
   * @param {{required?:boolean,label?:string,nullable?:boolean}} [o]
   */
  oneOf(k, allowed, o = {}) {
    const { required = true, label = k, nullable = false } = o;
    if (!this.has(k)) { if (required) this.fail(k, `${label} is required.`); return this; }
    const raw = this.input[k];
    if ((raw === null || raw === '') && nullable) { this.out[k] = null; return this; }
    if (typeof raw !== 'string' || !allowed.includes(raw)) this.fail(k, `${label} is not a valid choice.`);
    else this.out[k] = raw;
    return this;
  }

  /** @param {string} k @param {{required?:boolean,label?:string}} [o] */
  bool(k, o = {}) {
    const { required = false, label = k } = o;
    if (!this.has(k)) { if (required) this.fail(k, `${label} is required.`); return this; }
    if (typeof this.input[k] !== 'boolean') this.fail(k, `${label} must be true or false.`);
    else this.out[k] = this.input[k];
    return this;
  }

  done() {
    if (Object.keys(this.errors).length) {
      throw new HttpError(422, 'Please fix the highlighted fields.', 'validation', this.errors);
    }
    return this.out;
  }
}

/** @param {string} s */
export function escapeLike(s) { return s.replace(/[\\%_]/g, (m) => `\\${m}`); }

/** @param {string} name */
export function slugify(name) {
  const base = name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return base || 'clan';
}

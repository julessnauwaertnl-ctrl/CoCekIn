export class Router {
  constructor() {
    /** @type {{method:string, regex:RegExp, keys:string[], opts:{auth:'required'|'optional', limit?:string}, handler:(ctx:any)=>any}[]} */
    this.routes = [];
  }

  /**
   * @param {string} method @param {string} pattern
   * @param {{auth?:'required'|'optional', limit?:string}} opts @param {(ctx:any)=>any} handler
   */
  add(method, pattern, opts, handler) {
    /** @type {string[]} */
    const keys = [];
    const src = pattern.replace(/:([a-zA-Z]+)/g, (_m, k) => { keys.push(k); return '([^/]+)'; });
    this.routes.push({ method, regex: new RegExp(`^${src}$`), keys, opts: { auth: 'optional', ...opts }, handler });
  }

  get(p, o, h) { this.add('GET', p, o, h); }
  post(p, o, h) { this.add('POST', p, o, h); }
  patch(p, o, h) { this.add('PATCH', p, o, h); }
  del(p, o, h) { this.add('DELETE', p, o, h); }

  /** @param {string} method @param {string} pathname */
  match(method, pathname) {
    let pathMatched = false;
    for (const r of this.routes) {
      const m = r.regex.exec(pathname);
      if (!m) continue;
      pathMatched = true;
      if (r.method !== method && !(method === 'HEAD' && r.method === 'GET')) continue;
      /** @type {Record<string,string>} */
      const params = {};
      r.keys.forEach((k, i) => { try { params[k] = decodeURIComponent(m[i + 1]); } catch { params[k] = m[i + 1]; } });
      return { route: r, params, methodNotAllowed: false };
    }
    return { route: null, params: {}, methodNotAllowed: pathMatched };
  }
}

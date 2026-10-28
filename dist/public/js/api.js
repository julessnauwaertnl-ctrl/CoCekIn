export class ApiError extends Error {
  /** @param {number} status @param {string} message @param {string} [code] @param {Record<string,string>} [fields] */
  constructor(status, message, code = 'error', fields) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields || {};
  }
}

/**
 * @param {string} method @param {string} path @param {unknown} [body] @param {{signal?: AbortSignal}} [opts]
 * @returns {Promise<any>}
 */
export async function api(method, path, body, opts = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  opts.signal?.addEventListener('abort', () => ctrl.abort());
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: method === 'GET' ? { Accept: 'application/json' } : { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
      signal: ctrl.signal,
    });
  } catch (e) {
    if (opts.signal?.aborted) throw new ApiError(0, 'Request cancelled.', 'aborted');
    throw new ApiError(0, 'We could not reach CoCekIn. Check your connection and try again.', 'network');
  } finally { clearTimeout(timer); }
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON body */ }
  if (!res.ok) {
    const e = data?.error;
    throw new ApiError(res.status, e?.message || 'Something went wrong. Please try again.', e?.code, e?.fields);
  }
  return data;
}

/** @param {string} p @param {{signal?: AbortSignal}} [o] */
export const get = (p, o) => api('GET', p, undefined, o);
/** @param {string} p @param {unknown} [b] */
export const post = (p, b) => api('POST', p, b);
/** @param {string} p @param {unknown} [b] */
export const patch = (p, b) => api('PATCH', p, b);
/** @param {string} p @param {unknown} [b] */
export const del = (p, b) => api('DELETE', p, b);

/** Build a query string, skipping empty values. @param {Record<string, string|number|boolean|null|undefined>} o */
export function qs(o) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== '' && v != null && v !== false) p.set(k, v === true ? '1' : String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}

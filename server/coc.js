import { HttpError } from './errors.js';

/**
 * Thin client for the official Clash of Clans API. Only active when COC_API_TOKEN is configured.
 * @param {{token:string, base:string, fetchImpl?: typeof fetch}} opts
 */
export function createCocClient({ token, base, fetchImpl = fetch }) {
  const configured = Boolean(token);

  /** @param {string} path @param {RequestInit} [init] */
  async function call(path, init = {}) {
    if (!configured) throw new HttpError(503, 'Clash of Clans API access is not configured on this server.', 'coc_not_configured');
    let res;
    try {
      res = await fetchImpl(`${base}${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...(init.headers || {}) },
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      throw new HttpError(502, 'The Clash of Clans API did not respond. Please try again in a moment.', 'coc_unreachable');
    }
    if (res.status === 404) throw new HttpError(404, 'No Clash of Clans player was found with that tag.', 'coc_not_found');
    if (res.status === 429) throw new HttpError(429, 'The Clash of Clans API is rate limiting us. Try again shortly.', 'coc_rate_limited');
    if (res.status === 400) throw new HttpError(400, 'The Clash of Clans API rejected that request.', 'coc_bad_request');
    if (res.status === 403) throw new HttpError(502, 'The server’s Clash of Clans API key was rejected (check the key and its IP allow-list).', 'coc_forbidden');
    if (!res.ok) throw new HttpError(502, 'The Clash of Clans API is unavailable right now.', 'coc_unavailable');
    return /** @type {Record<string, any>} */ (await res.json());
  }

  const enc = (/** @type {string} */ tag) => encodeURIComponent(tag);

  return {
    configured,
    /** @param {string} tag */
    async getPlayer(tag) {
      const p = await call(`/players/${enc(tag)}`);
      return {
        name: String(p.name ?? ''),
        thLevel: Number.isInteger(p.townHallLevel) ? p.townHallLevel : null,
        trophies: Number.isInteger(p.trophies) ? p.trophies : null,
        bestTrophies: Number.isInteger(p.bestTrophies) ? p.bestTrophies : null,
        warStars: Number.isInteger(p.warStars) ? p.warStars : null,
        donations: Number.isInteger(p.donations) ? p.donations : null,
      };
    },
    /** @param {string} tag @param {string} playerToken */
    async verifyToken(tag, playerToken) {
      const r = await call(`/players/${enc(tag)}/verifytoken`, {
        method: 'POST', body: JSON.stringify({ token: playerToken }), headers: { 'Content-Type': 'application/json' },
      });
      return r.status === 'ok';
    },
  };
}

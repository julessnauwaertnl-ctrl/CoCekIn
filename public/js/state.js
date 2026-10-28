import { get } from './api.js';

/** @type {{ me: any|null, achievements: any[], ready: boolean, meta: {cocApi:boolean} }} */
export const session = { me: null, achievements: [], ready: false, meta: { cocApi: false } };
/** @type {Set<() => void>} */
const listeners = new Set();

/** @param {() => void} fn */
export function onSession(fn) { listeners.add(fn); return () => listeners.delete(fn); }
const emit = () => listeners.forEach((fn) => fn());

/** @param {{user:any, achievements?:any[]}|null} data */
export function setMe(data) {
  session.me = data?.user ?? null;
  session.achievements = data?.achievements ?? [];
  session.ready = true;
  emit();
}

export async function refreshMe() {
  try { setMe(await get('/me')); } catch { setMe(null); }
  return session.me;
}

export async function loadMeta() {
  try { session.meta = await get('/meta'); } catch { /* keep defaults */ }
}

/** @param {Record<string,string>} q @param {number} [def] @param {number} [max] */
export function pageParams(q, def = 12, max = 48) {
  const page = Math.max(1, Number.parseInt(q.page ?? '1', 10) || 1);
  const size = Math.min(max, Math.max(1, Number.parseInt(q.pageSize ?? String(def), 10) || def));
  return { page, size, offset: (page - 1) * size };
}

/** @template T @param {T[]} items @param {number} total @param {{page:number,size:number}} p */
export function pageResult(items, total, p) {
  return { items, total, page: p.page, pageSize: p.size, pages: Math.max(1, Math.ceil(total / p.size)) };
}

/** @param {string|undefined} v @param {number} min @param {number} max @returns {number|null} */
export function intParam(v, min, max) {
  if (v == null || v === '' || !/^-?\d+$/.test(v)) return null;
  const n = Number(v);
  return n >= min && n <= max ? n : null;
}

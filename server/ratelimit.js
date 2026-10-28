export class RateLimiter {
  constructor() {
    /** @type {Map<string, number[]>} */
    this.hits = new Map();
    this.timer = setInterval(() => this.sweep(), 60_000);
    this.timer.unref();
  }

  /**
   * @param {string} key @param {number} max @param {number} windowMs
   * @returns {{ok:boolean, retryAfter:number}}
   */
  hit(key, max, windowMs) {
    const t = Date.now();
    const arr = (this.hits.get(key) || []).filter((x) => t - x < windowMs);
    if (arr.length >= max) {
      this.hits.set(key, arr);
      return { ok: false, retryAfter: Math.max(1, Math.ceil((windowMs - (t - arr[0])) / 1000)) };
    }
    arr.push(t);
    this.hits.set(key, arr);
    return { ok: true, retryAfter: 0 };
  }

  /** @param {string} key */
  reset(key) { this.hits.delete(key); }

  sweep() {
    const t = Date.now();
    for (const [k, v] of this.hits) if (!v.length || t - v[v.length - 1] > 3_600_000) this.hits.delete(k);
  }

  close() { clearInterval(this.timer); }
}

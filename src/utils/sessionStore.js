/**
 * TTL-based session store to prevent memory leaks from abandoned sessions.
 * Each session auto-expires after the configured TTL (default: 10 minutes).
 */
class SessionStore {
  constructor(ttlMs = 10 * 60 * 1000) {
    this._map = new Map();
    this._ttlMs = ttlMs;
    // Periodic cleanup every 60 seconds
    this._cleanupInterval = setInterval(() => this._cleanup(), 60000);
    if (this._cleanupInterval.unref) this._cleanupInterval.unref();
  }

  get(key) {
    const entry = this._map.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.ts > this._ttlMs) {
      this._map.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key, value) {
    this._map.set(key, { value, ts: Date.now() });
  }

  delete(key) {
    this._map.delete(key);
  }

  has(key) {
    return this.get(key) !== undefined;
  }

  get size() {
    return this._map.size;
  }

  _cleanup() {
    const now = Date.now();
    for (const [key, entry] of this._map) {
      if (now - entry.ts > this._ttlMs) {
        this._map.delete(key);
      }
    }
  }

  destroy() {
    clearInterval(this._cleanupInterval);
    this._map.clear();
  }
}

module.exports = { SessionStore };

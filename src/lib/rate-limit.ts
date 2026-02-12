/**
 * Simple in-memory sliding-window rate limiter.
 *
 * Tracks request timestamps per key (typically IP address).
 * Works for single-instance deployments (standalone Next.js).
 */

type Entry = {
  timestamps: number[];
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds?: number;
};

export function createRateLimiter(opts: {
  /** Maximum requests allowed in the window */
  maxRequests: number;
  /** Window size in seconds */
  windowSeconds: number;
}) {
  const { maxRequests, windowSeconds } = opts;
  const windowMs = windowSeconds * 1000;
  const store = new Map<string, Entry>();

  // Periodic cleanup every 5 minutes to prevent memory leaks
  const CLEANUP_INTERVAL = 5 * 60 * 1000;
  let lastCleanup = Date.now();

  const cleanup = () => {
    const now = Date.now();
    if (now - lastCleanup < CLEANUP_INTERVAL) return;
    lastCleanup = now;

    const cutoff = now - windowMs;
    for (const [key, entry] of store) {
      entry.timestamps = entry.timestamps.filter((t) => t > cutoff);
      if (entry.timestamps.length === 0) {
        store.delete(key);
      }
    }
  };

  return {
    check(key: string): RateLimitResult {
      cleanup();

      const now = Date.now();
      const cutoff = now - windowMs;

      let entry = store.get(key);
      if (!entry) {
        entry = { timestamps: [] };
        store.set(key, entry);
      }

      // Remove expired timestamps
      entry.timestamps = entry.timestamps.filter((t) => t > cutoff);

      if (entry.timestamps.length >= maxRequests) {
        const oldestInWindow = entry.timestamps[0];
        const retryAfterMs = oldestInWindow + windowMs - now;
        return {
          allowed: false,
          remaining: 0,
          retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
        };
      }

      entry.timestamps.push(now);
      return {
        allowed: true,
        remaining: maxRequests - entry.timestamps.length,
      };
    },
  };
}

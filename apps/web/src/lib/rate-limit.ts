/**
 * Minimal in-memory sliding-window rate limiter.
 *
 * Scope and honesty: this is per-process. In serverless production
 * each instance has its own window, so the effective global limit is
 * (limit × instances). That's acceptable as defence-in-depth for v1 —
 * the real perimeter rate limit lands in Phase 9 (Cloudflare rules on
 * /api/*). Do NOT treat this as a security boundary on its own.
 */

interface Bucket {
  timestamps: number[];
}

const buckets = new Map<string, Bucket>();

/** Stop the map growing unboundedly: drop stale buckets occasionally. */
function sweep(windowMs: number) {
  if (buckets.size < 1000) return;
  const cutoff = Date.now() - windowMs;
  for (const [key, bucket] of buckets) {
    if (bucket.timestamps.every((t) => t < cutoff)) buckets.delete(key);
  }
}

/**
 * Record a hit for `key` and report whether it is within the limit.
 * Default: 10 requests per 60s window.
 */
export function rateLimitAllow(
  key: string,
  limit = 10,
  windowMs = 60_000,
): boolean {
  const now = Date.now();
  const cutoff = now - windowMs;
  sweep(windowMs);

  const bucket = buckets.get(key) ?? { timestamps: [] };
  bucket.timestamps = bucket.timestamps.filter((t) => t >= cutoff);

  if (bucket.timestamps.length >= limit) {
    buckets.set(key, bucket);
    return false;
  }

  bucket.timestamps.push(now);
  buckets.set(key, bucket);
  return true;
}

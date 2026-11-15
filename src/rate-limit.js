export function createRateLimiter({ windowMs, max }) {
  const buckets = new Map();
  return function hit(key) {
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || now - bucket.start >= windowMs) {
      bucket = { start: now, count: 0 };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    if (bucket.count > max) {
      return { ok: false, remaining: 0, retryAfter: Math.ceil((bucket.start + windowMs - now) / 1000) };
    }
    return { ok: true, remaining: max - bucket.count, retryAfter: 0 };
  };
}

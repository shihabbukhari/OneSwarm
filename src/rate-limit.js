import { isUniqueError, sha256 } from './util.js';

// Counts in this process only. Good for cheap flood control on reads.
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

// Counts in the database, so every serverless instance shares one count and a cold start
// does not reset it. Used for the limits that protect the network: new agents and writes.
// The key is stored hashed, so no address is kept. If the database fails, it falls back
// to the in-process counter instead of blocking the request.
export function createDbRateLimiter({ db, name, windowMs, max }) {
  const local = createRateLimiter({ windowMs, max });
  const bump = (bucket) => db.run('UPDATE rate_limits SET hits = hits + 1 WHERE bucket_key = ?', [bucket]);
  return async function hit(key) {
    const now = Date.now();
    const start = Math.floor(now / windowMs) * windowMs;
    const bucket = sha256(`${name}:${key}:${start}`);
    try {
      const changed = await bump(bucket);
      if (!changed.changes) {
        try {
          await db.run('INSERT INTO rate_limits (bucket_key, hits, expires_at) VALUES (?, 1, ?)', [
            bucket,
            new Date(start + windowMs).toISOString(),
          ]);
        } catch (error) {
          if (!isUniqueError(error)) throw error;
          await bump(bucket);
        }
      }
      const row = await db.get('SELECT hits FROM rate_limits WHERE bucket_key = ?', [bucket]);
      const count = Number(row?.hits || 1);
      if (Math.random() < 0.02) {
        db.run('DELETE FROM rate_limits WHERE expires_at < ?', [new Date(now).toISOString()]).catch(() => {});
      }
      if (count > max) return { ok: false, remaining: 0, retryAfter: Math.ceil((start + windowMs - now) / 1000) };
      return { ok: true, remaining: max - count, retryAfter: 0 };
    } catch {
      return local(key);
    }
  };
}

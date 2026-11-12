function createWindowRateLimiter({ limit, windowMs, keyGenerator, message, now = Date.now, resetOnSuccess = true }) {
  if (!Number.isInteger(limit) || limit < 1 || !Number.isFinite(windowMs) || windowMs < 1) {
    throw new TypeError('Rate limiter requires a positive limit and window.');
  }

  const buckets = new Map();
  const maxBuckets = 5000;

  return function rateLimit(req, res, next) {
    const timestamp = now();
    const key = String(keyGenerator(req) || 'unknown');
    let bucket = buckets.get(key);

    if (!bucket || timestamp >= bucket.resetAt) {
      if (!bucket && buckets.size >= maxBuckets) {
        for (const [bucketKey, entry] of buckets) {
          if (timestamp >= entry.resetAt) buckets.delete(bucketKey);
        }
        if (buckets.size >= maxBuckets) buckets.delete(buckets.keys().next().value);
      }
      bucket = { count: 0, resetAt: timestamp + windowMs };
      buckets.set(key, bucket);
    }

    if (bucket.count >= limit) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((bucket.resetAt - timestamp) / 1000))));
      return res.status(429).json({ error: message });
    }

    bucket.count += 1;
    if (resetOnSuccess) {
      res.once('finish', () => {
        if (res.statusCode < 400) buckets.delete(key);
      });
    }
    return next();
  };
}

module.exports = { createWindowRateLimiter };
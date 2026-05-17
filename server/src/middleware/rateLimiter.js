function createRateLimiter({ windowMs = 60000, max = 600 } = {}) {
  const buckets = new Map();

  return (req, res, next) => {
    const key =
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      req.socket?.remoteAddress ||
      req.ip ||
      "unknown";
    const now = Date.now();
    const current = buckets.get(key);

    if (!current || current.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    current.count += 1;
    if (current.count > max) {
      return res.status(429).json({ message: "Demasiadas solicitudes. Intenta nuevamente en unos segundos." });
    }

    return next();
  };
}

module.exports = {
  createRateLimiter
};

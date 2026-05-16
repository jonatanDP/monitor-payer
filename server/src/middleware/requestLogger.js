function requestLogger(req, res, next) {
  const startedAt = Date.now();
  const requestIp =
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    req.ip ||
    "unknown";

  res.on("finish", () => {
    const durationMs = Date.now() - startedAt;
    console.log(
      `[request] ${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs}ms ip=${requestIp}`
    );
  });

  next();
}

module.exports = requestLogger;

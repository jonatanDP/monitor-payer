function notFoundHandler(req, res) {
  res.status(404).json({
    message: `Route not found: ${req.method} ${req.originalUrl}`
  });
}

function errorHandler(err, _req, res, _next) {
  console.error("[error]", err);

  res.status(err.statusCode || 500).json({
    message: err.message || "Internal server error"
  });
}

module.exports = {
  notFoundHandler,
  errorHandler
};

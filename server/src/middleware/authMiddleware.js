const jwt = require("jsonwebtoken");
const env = require("../config/env");

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const [, token] = authHeader.split(" ");

  if (!token) {
    console.warn(`[auth] fail missing token ${req.method} ${req.originalUrl}`);
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const payload = jwt.verify(token, env.jwtSecret);
    req.user = payload;
    console.log(`[auth] success user=${payload.username || payload.sub} ${req.method} ${req.originalUrl}`);
    return next();
  } catch (error) {
    console.warn(`[auth] fail invalid token ${req.method} ${req.originalUrl}: ${error.message}`);
    return res.status(401).json({ message: "Invalid token" });
  }
}

module.exports = authMiddleware;

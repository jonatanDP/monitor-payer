const env = require("../config/env");

function deviceAuth(req, res, next) {
  if (!env.deviceApiToken) {
    return next();
  }

  const bearerToken = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const apiKey = req.headers["x-api-key"];

  if (bearerToken === env.deviceApiToken || apiKey === env.deviceApiToken) {
    return next();
  }

  return res.status(401).json({ message: "Invalid device API token" });
}

module.exports = deviceAuth;

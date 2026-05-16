const { createHttpError } = require("../utils/httpError");

function requireFields(fields) {
  return (req, _res, next) => {
    const missing = fields.filter((field) => {
      const value = req.body?.[field];
      return value === undefined || value === null || value === "";
    });

    if (missing.length > 0) {
      return next(createHttpError(400, `Missing required fields: ${missing.join(", ")}`));
    }

    return next();
  };
}

module.exports = {
  requireFields
};

const logService = require("../services/logService");

async function createLog(req, res, next) {
  try {
    const log = await logService.createLog(req.body || {});
    return res.status(201).json(log);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  createLog
};

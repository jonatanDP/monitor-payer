const heartbeatService = require("../services/heartbeatService");
const { getRequestIp } = require("../utils/requestIp");

async function heartbeat(req, res, next) {
  try {
    const result = await heartbeatService.processHeartbeat(
      req.params.id,
      req.body || {},
      getRequestIp(req)
    );
    return res.json(result);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  heartbeat
};

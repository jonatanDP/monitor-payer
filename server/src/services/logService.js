const logModel = require("../models/logModel");
const { createHttpError } = require("../utils/httpError");

async function createLog(payload) {
  if (!payload.event) {
    throw createHttpError(400, "event is required");
  }

  return logModel.createLog({
    deviceId: payload.device_id || payload.deviceId,
    event: payload.event,
    details:
      typeof payload.details === "string"
        ? payload.details
        : JSON.stringify(payload.details || {})
  });
}

module.exports = {
  createLog
};

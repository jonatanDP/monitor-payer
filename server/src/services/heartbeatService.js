const deviceService = require("./deviceService");
const logService = require("./logService");

async function processHeartbeat(deviceId, payload, requestIp) {
  const device = await deviceService.registerHeartbeat(deviceId, {
    ...payload,
    ip: payload.ip || requestIp
  });

  await logService.createLog({
    device_id: deviceId,
    event: "heartbeat",
    details: { status: device.status, mode: device.mode }
  });

  return {
    device
  };
}

module.exports = {
  processHeartbeat
};

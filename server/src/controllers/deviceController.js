const deviceService = require("../services/deviceService");
const logService = require("../services/logService");
const { getDatabaseStatus, verifyConnection, ensureTables } = require("../config/database");
const { getRequestIp } = require("../utils/requestIp");

async function listDevices(req, res) {
  try {
    console.log("[devices] GET /devices request received");
    console.log(`[devices] database status before query: ${getDatabaseStatus()}`);
    await verifyConnection();
    await ensureTables();
    console.log("[devices] query to execute: SELECT * FROM devices");

    const devices = await deviceService.listDevices();
    console.log(`[devices] results obtained: ${devices.length}`);
    return res.json(devices);
  } catch (error) {
    console.error("Error en /devices:", error);
    return res.status(500).json({ error: error.message });
  }
}

async function getDevice(req, res, next) {
  try {
    const device = await deviceService.getDevice(req.params.id);
    if (!device) {
      return res.status(404).json({ message: "Device not found" });
    }

    return res.json(device);
  } catch (error) {
    return next(error);
  }
}

async function createDevice(req, res, next) {
  try {
    const { id, name, location, status, ip, idleTime, idle_time, timeout_minutes, mode } = req.body;

    const device = await deviceService.createDevice({
      id,
      name,
      location,
      status,
      ip: ip || getRequestIp(req),
      idleTime: idleTime || idle_time || timeout_minutes,
      mode
    });

    await logService.createLog({
      device_id: device.id,
      event: "device registered",
      details: { ip: device.ip, mode: device.mode }
    });

    return res.status(201).json(device);
  } catch (error) {
    return next(error);
  }
}

async function updateDevice(req, res, next) {
  try {
    const device = await deviceService.updateDevice(req.params.id, req.body);
    if (!device) {
      return res.status(404).json({ message: "Device not found" });
    }

    return res.json(device);
  } catch (error) {
    return next(error);
  }
}

async function updateDeviceStatus(req, res, next) {
  try {
    const device = await deviceService.updateStatus(req.params.id, {
      ...req.body,
      ip: req.body?.ip || getRequestIp(req)
    });

    await logService.createLog({
      device_id: device.id,
      event: "heartbeat",
      details: { status: device.status, mode: device.mode }
    });

    return res.json(device);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  listDevices,
  getDevice,
  createDevice,
  updateDevice,
  updateDeviceStatus
};

const deviceService = require("../services/deviceService");
const commandService = require("../services/commandService");
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
    const {
      id,
      name,
      location,
      status,
      ip,
      idleTime,
      idle_time,
      timeout_minutes,
      mode,
      android_version,
      manufacturer,
      model,
      brand,
      device_group,
      group,
      tags,
      environment
    } = req.body;

    const device = await deviceService.createDevice({
      id,
      name,
      location,
      status,
      ip: ip || getRequestIp(req),
      idleTime: idleTime || idle_time || timeout_minutes,
      mode,
      android_version,
      manufacturer,
      model,
      brand,
      device_group,
      group,
      tags,
      environment
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

    const configPayload = {
      name: device.name,
      location: device.location,
      device_group: device.device_group,
      tags: device.tags,
      environment: device.environment,
      scheduled_power_on: device.scheduled_power_on,
      scheduled_power_off: device.scheduled_power_off,
      auto_sync_interval_minutes: device.auto_sync_interval_minutes,
      agent_hidden: device.agent_hidden,
      maintenance_mode: device.maintenance_mode
    };
    const command = await commandService.queueCommand(device.id, "APPLY_DEVICE_CONFIG", configPayload);
    await logService.createLog({
      device_id: device.id,
      event: "device config updated",
      details: { command_id: command.id, ...configPayload }
    });

    return res.json(device);
  } catch (error) {
    return next(error);
  }
}

async function saveSchedule(req, res, next) {
  try {
    const schedule = await deviceService.saveSchedule(req.params.id, req.body);
    if (!schedule) {
      return res.status(404).json({ message: "Device not found" });
    }

    const command = await commandService.queueCommand(req.params.id, "APPLY_DEVICE_CONFIG", {
      scheduled_power_on: schedule.power_on,
      scheduled_power_off: schedule.power_off,
      timezone: schedule.timezone,
      schedule_enabled: schedule.enabled
    });

    await logService.createLog({
      device_id: req.params.id,
      event: "schedule updated",
      details: { command_id: command.id, schedule_id: schedule.id }
    });

    return res.status(201).json({ schedule, command });
  } catch (error) {
    return next(error);
  }
}

async function requestScreenshot(req, res, next) {
  try {
    const screenshot = await deviceService.requestScreenshot(req.params.id);
    if (!screenshot) {
      return res.status(404).json({ message: "Device not found" });
    }

    const command = await commandService.queueCommand(req.params.id, "CAPTURE_SCREEN", {
      screenshot_id: screenshot.id
    });

    await logService.createLog({
      device_id: req.params.id,
      event: "screenshot requested",
      details: { screenshot_id: screenshot.id, command_id: command.id }
    });

    return res.status(202).json({ screenshot, command });
  } catch (error) {
    return next(error);
  }
}

async function bulkCommand(req, res, next) {
  try {
    const { type, deviceIds, payload = {} } = req.body;
    if (!type) {
      return res.status(400).json({ message: "type is required" });
    }

    const targetIds = await deviceService.findTargetIds(deviceIds);
    const commands = [];
    for (const deviceId of targetIds) {
      commands.push(await commandService.queueCommand(deviceId, type, payload));
    }

    await logService.createLog({
      device_id: null,
      event: "bulk command queued",
      details: { type, count: commands.length }
    });

    return res.status(201).json({ type, count: commands.length, commands });
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
  saveSchedule,
  requestScreenshot,
  bulkCommand,
  updateDeviceStatus
};

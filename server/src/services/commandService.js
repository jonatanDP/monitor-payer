const commandModel = require("../models/commandModel");
const { createHttpError } = require("../utils/httpError");

const ALLOWED_ACTIONS = [
  "SCREEN_OFF",
  "SCREEN_ON",
  "RESTART_APP",
  "REBOOT_DEVICE",
  "REFRESH_KIOSK",
  "LOCK_SCREEN",
  "UNLOCK_SCREEN",
  "PING",
  "UPDATE_CONFIG",
  "SYNC",
  "CLEAR_CACHE",
  "MAINTENANCE_MODE"
];

async function queueCommand(deviceId, action, payload) {
  if (!ALLOWED_ACTIONS.includes(action)) {
    throw createHttpError(400, "Unsupported action");
  }

  return commandModel.createCommand(deviceId, action, payload);
}

async function getDeviceCommands(deviceId) {
  return commandModel.getPendingCommands(deviceId);
}

async function executeCommand(commandId) {
  const command = await commandModel.markCommandExecuted(commandId);
  if (!command) {
    throw createHttpError(404, "Command not found");
  }

  return command;
}

module.exports = {
  queueCommand,
  getDeviceCommands,
  executeCommand
};

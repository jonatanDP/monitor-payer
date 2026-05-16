const commandService = require("../services/commandService");
const logService = require("../services/logService");

async function createCommand(req, res, next) {
  try {
    const { action, ...payload } = req.body;
    if (!action) {
      return res.status(400).json({ message: "action is required" });
    }

    const command = await commandService.queueCommand(req.params.id, action, payload);
    await logService.createLog({
      device_id: req.params.id,
      event: action === "SCREEN_OFF" ? "screen off" : "command queued",
      details: { action, command_id: command.id }
    });
    return res.status(201).json(command);
  } catch (error) {
    return next(error);
  }
}

async function getDeviceCommands(req, res, next) {
  try {
    const commands = await commandService.getDeviceCommands(req.params.id);
    return res.json(
      commands.map((command) => ({
        id: command.id,
        action: command.action,
        ...command.payload
      }))
    );
  } catch (error) {
    return next(error);
  }
}

async function executeCommand(req, res, next) {
  try {
    const commandId = Number(req.params.id);
    if (!Number.isInteger(commandId)) {
      return res.status(400).json({ message: "Invalid command id" });
    }

    const command = await commandService.executeCommand(commandId);
    await logService.createLog({
      device_id: command.device_id,
      event: "command executed",
      details: { action: command.action, command_id: command.id }
    });
    return res.json(command);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  createCommand,
  getDeviceCommands,
  executeCommand
};

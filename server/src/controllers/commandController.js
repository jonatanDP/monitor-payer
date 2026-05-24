const commandService = require("../services/commandService");
const logService = require("../services/logService");

async function createCommand(req, res, next) {
  try {
    const { type, ...payload } = req.body;
    if (!type) {
      return res.status(400).json({ message: "type is required" });
    }

    console.log(`[commands] received device=${req.params.id} type=${type}`);
    const command = await commandService.queueCommand(req.params.id, type, payload);
    await logService.createLog({
      device_id: req.params.id,
      event: type === "SCREEN_OFF" ? "screen off" : "command queued",
      details: { type, command_id: command.id }
    });
    return res.status(201).json({
      ...command,
      type: command.action,
      pending: !command.executed
    });
  } catch (error) {
    return next(error);
  }
}

async function getDeviceCommands(req, res, next) {
  try {
    const commands = await commandService.getDeviceCommands(req.params.id);
    if (commands.length > 0) {
      console.log(`[commands] delivered device=${req.params.id} count=${commands.length}`);
    }
    return res.json(
      commands.map((command) => ({
        id: command.id,
        type: command.action,
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
      details: { type: command.action, command_id: command.id }
    });
    console.log(`[commands] executed id=${command.id} device=${command.device_id} type=${command.action}`);
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

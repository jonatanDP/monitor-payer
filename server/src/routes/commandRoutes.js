const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const deviceAuth = require("../middleware/deviceAuth");
const commandController = require("../controllers/commandController");
const { requireFields } = require("../middleware/validateRequest");

const router = express.Router();

router.post(
  "/devices/:id/command",
  authMiddleware,
  requireFields(["action"]),
  commandController.createCommand
);
router.get("/devices/:id/commands", deviceAuth, commandController.getDeviceCommands);
router.put("/commands/:id/execute", deviceAuth, commandController.executeCommand);

module.exports = router;

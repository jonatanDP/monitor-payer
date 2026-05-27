const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const deviceAuth = require("../middleware/deviceAuth");
const deviceController = require("../controllers/deviceController");

const router = express.Router();

router.get("/devices", authMiddleware, deviceController.listDevices);
router.post("/devices", deviceAuth, deviceController.createDevice);
router.post("/devices/bulk-command", authMiddleware, deviceController.bulkCommand);
router.post("/devices/:id/schedule", authMiddleware, deviceController.saveSchedule);
router.post("/devices/:id/screenshot", authMiddleware, deviceController.requestScreenshot);
router.put("/devices/:id/status", deviceAuth, deviceController.updateDeviceStatus);
router.put("/devices/:id", authMiddleware, deviceController.updateDevice);
router.get("/devices/:id", deviceAuth, deviceController.getDevice);

module.exports = router;

const express = require("express");
const deviceAuth = require("../middleware/deviceAuth");
const heartbeatController = require("../controllers/heartbeatController");

const router = express.Router();

router.post("/devices/:id/heartbeat", deviceAuth, heartbeatController.heartbeat);

module.exports = router;

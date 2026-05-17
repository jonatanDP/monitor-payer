const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const monitoringController = require("../controllers/monitoringController");

const router = express.Router();

router.get("/stats", authMiddleware, monitoringController.getDashboardStats);
router.get("/technical-logs", authMiddleware, monitoringController.listTechnicalLogs);
router.get("/devices/:id/timeline", authMiddleware, monitoringController.getDeviceTimeline);

module.exports = router;

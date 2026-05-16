const express = require("express");
const deviceAuth = require("../middleware/deviceAuth");
const logController = require("../controllers/logController");

const router = express.Router();

router.post("/logs", deviceAuth, logController.createLog);

module.exports = router;

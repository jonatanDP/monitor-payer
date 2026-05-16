const express = require("express");
const authController = require("../controllers/authController");
const { requireFields } = require("../middleware/validateRequest");

const router = express.Router();

router.post("/auth/login", requireFields(["username", "password"]), authController.login);

module.exports = router;

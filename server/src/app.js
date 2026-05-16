const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/authRoutes");
const deviceRoutes = require("./routes/deviceRoutes");
const commandRoutes = require("./routes/commandRoutes");
const heartbeatRoutes = require("./routes/heartbeatRoutes");
const logRoutes = require("./routes/logRoutes");
const requestLogger = require("./middleware/requestLogger");
const { notFoundHandler, errorHandler } = require("./middleware/errorHandler");
const env = require("./config/env");

const app = express();

app.use((req, res, next) => {
  req.setTimeout(15000);
  res.setTimeout(15000);
  next();
});

app.use(cors({
  origin(origin, callback) {
    if (!origin || env.corsOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`CORS origin not allowed: ${origin}`));
  },
  methods: ["GET", "POST", "PUT", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-API-Key"]
}));
app.use(express.json());
app.use(requestLogger);

app.get("/health", (_req, res) => {
  res.json({
    status: "ok"
  });
});

app.use(authRoutes);
app.use(deviceRoutes);
app.use(commandRoutes);
app.use(heartbeatRoutes);
app.use(logRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;

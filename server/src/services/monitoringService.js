const monitoringModel = require("../models/monitoringModel");

async function getDashboardStats() {
  return monitoringModel.getDashboardStats();
}

async function getDeviceTimeline(deviceId) {
  return monitoringModel.getDeviceTimeline(deviceId);
}

async function listTechnicalLogs(limit) {
  const parsedLimit = Number(limit);
  const safeLimit = Number.isInteger(parsedLimit)
    ? Math.min(Math.max(parsedLimit, 1), 250)
    : 100;

  return monitoringModel.listTechnicalLogs(safeLimit);
}

module.exports = {
  getDashboardStats,
  getDeviceTimeline,
  listTechnicalLogs
};

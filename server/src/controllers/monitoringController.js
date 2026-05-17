const monitoringService = require("../services/monitoringService");

async function getDashboardStats(_req, res, next) {
  try {
    const stats = await monitoringService.getDashboardStats();
    return res.json(stats);
  } catch (error) {
    return next(error);
  }
}

async function getDeviceTimeline(req, res, next) {
  try {
    const timeline = await monitoringService.getDeviceTimeline(req.params.id);
    return res.json(timeline);
  } catch (error) {
    return next(error);
  }
}

async function listTechnicalLogs(req, res, next) {
  try {
    const logs = await monitoringService.listTechnicalLogs(req.query.limit);
    return res.json(logs);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getDashboardStats,
  getDeviceTimeline,
  listTechnicalLogs
};

const deviceModel = require("../models/deviceModel");

async function listDevices() {
  return deviceModel.findAll();
}

async function getDevice(id) {
  return deviceModel.findById(id);
}

async function createDevice(payload) {
  return deviceModel.createDevice(payload);
}

async function updateDevice(id, payload) {
  return deviceModel.updateDevice(id, payload);
}

async function saveSchedule(id, payload) {
  return deviceModel.saveSchedule(id, payload);
}

async function requestScreenshot(id) {
  return deviceModel.requestScreenshot(id);
}

async function findTargetIds(deviceIds) {
  return deviceModel.findIds(deviceIds);
}

async function updateStatus(id, payload) {
  return deviceModel.updateStatus(id, payload);
}

async function registerHeartbeat(id, payload) {
  return deviceModel.upsertHeartbeat(id, payload);
}

module.exports = {
  listDevices,
  getDevice,
  createDevice,
  updateDevice,
  saveSchedule,
  requestScreenshot,
  findTargetIds,
  updateStatus,
  registerHeartbeat
};

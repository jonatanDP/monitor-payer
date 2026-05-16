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
  updateStatus,
  registerHeartbeat
};

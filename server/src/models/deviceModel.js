const { randomUUID } = require("crypto");
const pool = require("./db");

async function markOfflineDevices() {
  await pool.query(
    "UPDATE devices SET status = 'offline' WHERE last_seen IS NOT NULL AND last_seen < NOW() - INTERVAL '60 seconds'"
  );
}

async function findAll() {
  await markOfflineDevices();
  const query = "SELECT id, name, location, status, last_seen, ip, idle_time, mode, created_at FROM devices ORDER BY last_seen DESC NULLS LAST, created_at DESC";
  const result = await pool.query(query);
  return result.rows;
}

async function findById(id) {
  await markOfflineDevices();
  const result = await pool.query(
    "SELECT id, name, location, status, last_seen, ip, idle_time, mode FROM devices WHERE id = $1 LIMIT 1",
    [id]
  );
  return result.rows[0] || null;
}

async function createDevice(device) {
  const id = device.id || randomUUID();
  const result = await pool.query(
    `INSERT INTO devices (id, name, location, status, last_seen, ip, idle_time, mode)
     VALUES ($1, $2, $3, COALESCE($4, 'online'), COALESCE($5, NOW()), $6, $7, $8)
     ON CONFLICT (id)
     DO UPDATE SET
       name = COALESCE(EXCLUDED.name, devices.name),
       location = COALESCE(EXCLUDED.location, devices.location),
       status = COALESCE(EXCLUDED.status, devices.status, 'online'),
       last_seen = NOW(),
       ip = COALESCE(NULLIF(EXCLUDED.ip, ''), devices.ip),
       idle_time = COALESCE(EXCLUDED.idle_time, devices.idle_time),
       mode = COALESCE(EXCLUDED.mode, devices.mode)
     RETURNING id, name, location, status, last_seen, ip, idle_time, mode, created_at`,
    [
      id,
      device.name,
      device.location || "",
      device.status || "offline",
      device.lastSeen || null,
      device.ip || "",
      device.idleTime || 30,
      device.mode || "SCREEN_OFF"
    ]
  );
  return result.rows[0];
}

async function updateDevice(id, updates) {
  const current = await findById(id);
  if (!current) {
    return null;
  }

  const result = await pool.query(
    `UPDATE devices
     SET name = $2,
         location = $3,
         status = $4,
         last_seen = $5,
         ip = $6,
         idle_time = $7,
         mode = $8
     WHERE id = $1
     RETURNING id, name, location, status, last_seen, ip, idle_time, mode`,
    [
      id,
      updates.name ?? current.name,
      updates.location ?? current.location,
      updates.status ?? current.status,
      updates.lastSeen ?? current.last_seen,
      updates.ip ?? current.ip,
      updates.idleTime ?? current.idle_time,
      updates.mode ?? current.mode
    ]
  );
  return result.rows[0];
}

async function updateStatus(deviceId, payload) {
  const result = await pool.query(
    `INSERT INTO devices (id, name, location, status, last_seen, ip, idle_time, mode)
     VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7)
     ON CONFLICT (id)
     DO UPDATE SET
       name = COALESCE(EXCLUDED.name, devices.name),
       location = COALESCE(EXCLUDED.location, devices.location),
       status = COALESCE(EXCLUDED.status, 'online'),
       last_seen = NOW(),
       ip = COALESCE(NULLIF(EXCLUDED.ip, ''), devices.ip),
       idle_time = COALESCE(EXCLUDED.idle_time, devices.idle_time),
       mode = COALESCE(EXCLUDED.mode, devices.mode)
     RETURNING id, name, location, status, last_seen, ip, idle_time, mode, created_at`,
    [
      deviceId,
      payload.name || `Device ${deviceId.slice(0, 8)}`,
      payload.location || "",
      payload.status || "online",
      payload.ip || "",
      payload.timeout_minutes || payload.idle_time || 30,
      payload.mode || "SCREEN_OFF"
    ]
  );
  return result.rows[0];
}

async function upsertHeartbeat(deviceId, payload) {
  const device = await updateStatus(deviceId, {
    ...payload,
    status: payload.status || "online"
  });

  await pool.query(
    "INSERT INTO heartbeats (device_id, status) VALUES ($1, $2)",
    [deviceId, device.status]
  );

  return device;
}

module.exports = {
  findAll,
  findById,
  createDevice,
  updateDevice,
  updateStatus,
  upsertHeartbeat,
  markOfflineDevices
};

const { randomUUID } = require("crypto");
const pool = require("./db");

async function markOfflineDevices() {
  await pool.query(
    "UPDATE devices SET status = 'offline' WHERE last_seen IS NOT NULL AND last_seen < NOW() - INTERVAL '60 seconds'"
  );
}

async function findAll() {
  await markOfflineDevices();
  const query = `
    SELECT
      d.*,
      COALESCE(pending.pending_commands, 0)::int AS pending_commands,
      COALESCE(today_commands.restart_app_count, 0)::int AS restart_app_today,
      COALESCE(today_commands.screen_off_count, 0)::int AS screen_off_today,
      CASE
        WHEN d.last_seen IS NULL THEN false
        WHEN d.last_seen < NOW() - INTERVAL '60 seconds' THEN false
        WHEN frozen.device_id IS NOT NULL THEN true
        ELSE false
      END AS frozen
    FROM devices d
    LEFT JOIN (
      SELECT device_id, COUNT(*) AS pending_commands
      FROM commands
      WHERE executed = false
      GROUP BY device_id
    ) pending ON pending.device_id = d.id
    LEFT JOIN (
      SELECT
        device_id,
        COUNT(*) FILTER (WHERE action = 'RESTART_APP') AS restart_app_count,
        COUNT(*) FILTER (WHERE action = 'SCREEN_OFF') AS screen_off_count
      FROM commands
      WHERE created_at >= CURRENT_DATE
      GROUP BY device_id
    ) today_commands ON today_commands.device_id = d.id
    LEFT JOIN (
      SELECT device_id
      FROM heartbeats
      WHERE created_at >= NOW() - INTERVAL '3 minutes'
        AND heartbeat_signature IS NOT NULL
      GROUP BY device_id
      HAVING COUNT(*) >= 6 AND COUNT(DISTINCT heartbeat_signature) = 1
    ) frozen ON frozen.device_id = d.id
    ORDER BY d.last_seen DESC NULLS LAST, d.created_at DESC
  `;
  const result = await pool.query(query);
  return result.rows;
}

async function findById(id) {
  await markOfflineDevices();
  const result = await pool.query(
    "SELECT * FROM devices WHERE id = $1 LIMIT 1",
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
    `INSERT INTO devices (
       id, name, location, status, last_seen, ip, idle_time, mode,
       android_version, manufacturer, model, uptime_ms, temperature_c,
       ram_used_mb, ram_total_mb, storage_free_mb, storage_total_mb,
       battery_level, battery_charging, service_running, monitoring_enabled,
       device_owner, lock_task_active, last_event, latency_ms,
       heartbeat_signature, last_boot_at
     )
     VALUES (
       $1, $2, $3, $4, NOW(), $5, $6, $7,
       $8, $9, $10, $11, $12,
       $13, $14, $15, $16,
       $17, $18, $19, $20,
       $21, $22, $23, $24,
       $25, CASE WHEN $26::bigint IS NULL THEN NULL ELSE NOW() - ($26::bigint * INTERVAL '1 millisecond') END
     )
     ON CONFLICT (id)
     DO UPDATE SET
       name = COALESCE(EXCLUDED.name, devices.name),
       location = COALESCE(EXCLUDED.location, devices.location),
       status = COALESCE(EXCLUDED.status, 'online'),
       last_seen = NOW(),
       ip = COALESCE(NULLIF(EXCLUDED.ip, ''), devices.ip),
       idle_time = COALESCE(EXCLUDED.idle_time, devices.idle_time),
       mode = COALESCE(EXCLUDED.mode, devices.mode),
       android_version = COALESCE(EXCLUDED.android_version, devices.android_version),
       manufacturer = COALESCE(EXCLUDED.manufacturer, devices.manufacturer),
       model = COALESCE(EXCLUDED.model, devices.model),
       uptime_ms = COALESCE(EXCLUDED.uptime_ms, devices.uptime_ms),
       temperature_c = COALESCE(EXCLUDED.temperature_c, devices.temperature_c),
       ram_used_mb = COALESCE(EXCLUDED.ram_used_mb, devices.ram_used_mb),
       ram_total_mb = COALESCE(EXCLUDED.ram_total_mb, devices.ram_total_mb),
       storage_free_mb = COALESCE(EXCLUDED.storage_free_mb, devices.storage_free_mb),
       storage_total_mb = COALESCE(EXCLUDED.storage_total_mb, devices.storage_total_mb),
       battery_level = COALESCE(EXCLUDED.battery_level, devices.battery_level),
       battery_charging = COALESCE(EXCLUDED.battery_charging, devices.battery_charging),
       service_running = COALESCE(EXCLUDED.service_running, devices.service_running),
       monitoring_enabled = COALESCE(EXCLUDED.monitoring_enabled, devices.monitoring_enabled),
       device_owner = COALESCE(EXCLUDED.device_owner, devices.device_owner),
       lock_task_active = COALESCE(EXCLUDED.lock_task_active, devices.lock_task_active),
       last_event = COALESCE(EXCLUDED.last_event, devices.last_event),
       latency_ms = COALESCE(EXCLUDED.latency_ms, devices.latency_ms),
       heartbeat_signature = COALESCE(EXCLUDED.heartbeat_signature, devices.heartbeat_signature),
       last_boot_at = COALESCE(EXCLUDED.last_boot_at, devices.last_boot_at)
     RETURNING *`,
    [
      deviceId,
      payload.name || `Device ${deviceId.slice(0, 8)}`,
      payload.location || "",
      payload.status || "online",
      payload.ip || "",
      payload.timeout_minutes || payload.idle_time || 30,
      payload.mode || "SCREEN_OFF",
      payload.android_version || null,
      payload.manufacturer || null,
      payload.model || null,
      payload.uptime_ms || null,
      payload.temperature_c || null,
      payload.ram_used_mb || null,
      payload.ram_total_mb || null,
      payload.storage_free_mb || null,
      payload.storage_total_mb || null,
      payload.battery_level ?? null,
      payload.battery_charging ?? null,
      payload.service_running ?? null,
      payload.monitoring_enabled ?? null,
      payload.device_owner ?? null,
      payload.lock_task_active ?? null,
      payload.last_event || null,
      payload.latency_ms || null,
      payload.heartbeat_signature || null,
      payload.uptime_ms || null
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
    `INSERT INTO heartbeats (device_id, status, uptime_ms, heartbeat_signature, latency_ms, details)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      deviceId,
      device.status,
      payload.uptime_ms || null,
      payload.heartbeat_signature || null,
      payload.latency_ms || null,
      JSON.stringify(payload || {})
    ]
  );

  await pool.query(
    `INSERT INTO metrics (
       device_id, uptime_ms, ram_used_mb, ram_total_mb, storage_free_mb,
       storage_total_mb, battery_level, temperature_c, latency_ms
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      deviceId,
      payload.uptime_ms || null,
      payload.ram_used_mb || null,
      payload.ram_total_mb || null,
      payload.storage_free_mb || null,
      payload.storage_total_mb || null,
      payload.battery_level ?? null,
      payload.temperature_c || null,
      payload.latency_ms || null
    ]
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

const pool = require("./db");

async function getDashboardStats() {
  const result = await pool.query(`
    WITH device_state AS (
      SELECT
        d.*,
        CASE
          WHEN d.last_seen IS NULL THEN false
          WHEN d.last_seen < NOW() - INTERVAL '60 seconds' THEN false
          WHEN frozen.device_id IS NOT NULL THEN true
          ELSE false
        END AS frozen
      FROM devices d
      LEFT JOIN (
        SELECT device_id
        FROM heartbeats
        WHERE created_at >= NOW() - INTERVAL '3 minutes'
          AND heartbeat_signature IS NOT NULL
        GROUP BY device_id
        HAVING COUNT(*) >= 6 AND COUNT(DISTINCT heartbeat_signature) = 1
      ) frozen ON frozen.device_id = d.id
    )
    SELECT
      COUNT(*)::int AS total_devices,
      COUNT(*) FILTER (WHERE status = 'online')::int AS online_devices,
      COUNT(*) FILTER (WHERE status = 'offline' OR last_seen < NOW() - INTERVAL '60 seconds')::int AS offline_devices,
      COUNT(*) FILTER (WHERE frozen = true)::int AS frozen_devices,
      COUNT(*) FILTER (WHERE last_seen IS NULL OR last_seen < NOW() - INTERVAL '20 seconds')::int AS missing_heartbeat_devices,
      COALESCE((SELECT COUNT(*) FROM commands WHERE action = 'RESTART_APP' AND created_at >= CURRENT_DATE), 0)::int AS restarts_today,
      COALESCE((SELECT COUNT(*) FROM commands WHERE action = 'SCREEN_OFF' AND created_at >= CURRENT_DATE), 0)::int AS screen_off_today,
      COALESCE(AVG(EXTRACT(EPOCH FROM (NOW() - last_boot_at))) FILTER (WHERE last_boot_at IS NOT NULL), 0)::int AS average_online_seconds,
      COALESCE((SELECT COUNT(*) FROM commands WHERE executed = false), 0)::int AS pending_commands,
      COALESCE((SELECT COUNT(*) FROM alerts WHERE resolved = false), 0)::int AS open_alerts
    FROM device_state
  `);

  return result.rows[0];
}

async function getDeviceTimeline(deviceId) {
  const [logs, commands, heartbeats, metrics, alerts] = await Promise.all([
    pool.query(
      "SELECT id, event, details, created_at FROM logs WHERE device_id = $1 ORDER BY created_at DESC LIMIT 50",
      [deviceId]
    ),
    pool.query(
      "SELECT id, action, executed, payload, created_at FROM commands WHERE device_id = $1 ORDER BY created_at DESC LIMIT 50",
      [deviceId]
    ),
    pool.query(
      "SELECT id, status, uptime_ms, heartbeat_signature, latency_ms, created_at FROM heartbeats WHERE device_id = $1 ORDER BY created_at DESC LIMIT 50",
      [deviceId]
    ),
    pool.query(
      "SELECT * FROM metrics WHERE device_id = $1 ORDER BY created_at DESC LIMIT 50",
      [deviceId]
    ),
    pool.query(
      "SELECT id, severity, type, message, resolved, created_at FROM alerts WHERE device_id = $1 ORDER BY created_at DESC LIMIT 50",
      [deviceId]
    )
  ]);

  return {
    logs: logs.rows,
    commands: commands.rows,
    heartbeats: heartbeats.rows,
    metrics: metrics.rows,
    alerts: alerts.rows
  };
}

async function listTechnicalLogs(limit = 100) {
  const result = await pool.query(
    `SELECT id, device_id, event, details, created_at
     FROM logs
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit]
  );
  return result.rows;
}

module.exports = {
  getDashboardStats,
  getDeviceTimeline,
  listTechnicalLogs
};

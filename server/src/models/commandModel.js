const pool = require("./db");

async function createCommand(deviceId, action, payload) {
  const result = await pool.query(
    `INSERT INTO commands (device_id, action, payload, executed, created_at)
     VALUES ($1, $2, $3::jsonb, false, NOW())
     RETURNING id, device_id, action, payload, executed, created_at`,
    [deviceId, action, JSON.stringify(payload || {})]
  );
  return result.rows[0];
}

async function getPendingCommands(deviceId) {
  const result = await pool.query(
    `SELECT id, device_id, action, payload, executed, created_at
     FROM commands
     WHERE device_id = $1 AND executed = false
     ORDER BY created_at ASC`,
    [deviceId]
  );
  return result.rows;
}

async function markCommandExecuted(id) {
  const result = await pool.query(
    `UPDATE commands
     SET executed = true
     WHERE id = $1
     RETURNING id, device_id, action, payload, executed, created_at`,
    [id]
  );

  return result.rows[0] || null;
}

module.exports = {
  createCommand,
  getPendingCommands,
  markCommandExecuted
};

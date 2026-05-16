const pool = require("./db");

async function createLog({ deviceId, event, details }) {
  const result = await pool.query(
    `INSERT INTO logs (device_id, event, details)
     VALUES ($1, $2, $3)
     RETURNING id, device_id, event, details, created_at`,
    [deviceId || null, event, details || ""]
  );
  return result.rows[0];
}

module.exports = {
  createLog
};

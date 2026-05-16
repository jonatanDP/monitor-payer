const pool = require("./db");

async function findByUsername(username) {
  const result = await pool.query(
    "SELECT id, username, password, role FROM users WHERE username = $1 LIMIT 1",
    [username]
  );
  return result.rows[0] || null;
}

module.exports = {
  findByUsername
};

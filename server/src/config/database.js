const bcrypt = require("bcrypt");
const { Pool } = require("pg");
const env = require("./env");
const { ensureSchema } = require("../database/schema");

let databaseStatus = "disconnected";

const poolConfig = env.databaseUrl
  ? {
      connectionString: env.databaseUrl,
      ssl: { rejectUnauthorized: false }
    }
  : {
      host: env.dbHost,
      port: env.dbPort,
      user: env.dbUser,
      password: env.dbPassword,
      database: env.dbName
    };

const pool = new Pool({
  ...poolConfig,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  query_timeout: 10000,
  statement_timeout: 10000
});

pool.on("error", (error) => {
  databaseStatus = "disconnected";
  console.error("[db] Unexpected PostgreSQL pool error:", error.message);
});

async function verifyConnection() {
  const client = await pool.connect();
  try {
    await client.query("SELECT 1");
    databaseStatus = "connected";
    console.log("Database connected successfully");
    return true;
  } finally {
    client.release();
  }
}

async function createDatabaseIfMissing(error) {
  if (env.databaseUrl || error?.code !== "3D000") {
    return false;
  }

  const adminPool = new Pool({
    host: env.dbHost,
    port: env.dbPort,
    user: env.dbUser,
    password: env.dbPassword,
    database: "postgres",
    max: 1,
    idleTimeoutMillis: 5000,
    connectionTimeoutMillis: 5000
  });

  try {
    const existsResult = await adminPool.query(
      "SELECT 1 FROM pg_database WHERE datname = $1 LIMIT 1",
      [env.dbName]
    );

    if (existsResult.rowCount === 0) {
      await adminPool.query(`CREATE DATABASE "${env.dbName}"`);
      console.log(`Database ${env.dbName} created successfully`);
    }

    return true;
  } catch (createError) {
    console.error(`Database creation failed: ${createError.message}`);
    return false;
  } finally {
    await adminPool.end();
  }
}

async function ensureTables() {
  await ensureSchema(pool);
}

async function ensureDefaultAdminUser() {
  const defaultUsername = "admin";
  const defaultPasswordHash = await bcrypt.hash("admin123", 10);

  await pool.query(
    `
      INSERT INTO users (username, password, role)
      VALUES ($1, $2, 'admin')
      ON CONFLICT (username) DO NOTHING
    `,
    [defaultUsername, defaultPasswordHash]
  );
}

async function initializeDatabase() {
  try {
    await verifyConnection();
    await ensureTables();
    await ensureDefaultAdminUser();
    console.log("Database schema ready");
    return true;
  } catch (error) {
    const databaseCreated = await createDatabaseIfMissing(error);

    if (databaseCreated) {
      try {
        await verifyConnection();
        await ensureTables();
        await ensureDefaultAdminUser();
        console.log("Database schema ready");
        return true;
      } catch (retryError) {
        databaseStatus = "disconnected";
        console.error(`Database connection failed: ${retryError.message}`);
        return false;
      }
    }

    databaseStatus = "disconnected";
    console.error(`Database connection failed: ${error.message}`);
    return false;
  }
}

function getDatabaseStatus() {
  return databaseStatus;
}

async function closePool() {
  await pool.end();
}

module.exports = {
  pool,
  verifyConnection,
  initializeDatabase,
  ensureTables,
  getDatabaseStatus,
  closePool
};

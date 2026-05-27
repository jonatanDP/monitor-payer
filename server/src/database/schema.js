async function ensureSchema(pool) {
  await pool.query(`
    DO $$
    DECLARE
      constraint_record RECORD;
    BEGIN
      IF to_regclass('devices') IS NOT NULL THEN
        FOR constraint_record IN
          SELECT conrelid::regclass AS table_name, conname
          FROM pg_constraint
          WHERE contype = 'f'
            AND confrelid = 'devices'::regclass
        LOOP
          EXECUTE format(
            'ALTER TABLE %s DROP CONSTRAINT IF EXISTS %I',
            constraint_record.table_name,
            constraint_record.conname
          );
        END LOOP;
      END IF;
    END $$;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      name TEXT,
      status TEXT,
      ip TEXT,
      mode TEXT,
      last_seen TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query("ALTER TABLE devices ALTER COLUMN id TYPE TEXT USING id::TEXT");
  await pool.query("ALTER TABLE devices ALTER COLUMN name DROP NOT NULL");
  await pool.query("ALTER TABLE devices ADD COLUMN IF NOT EXISTS status TEXT");
  await pool.query("ALTER TABLE devices ADD COLUMN IF NOT EXISTS ip TEXT");
  await pool.query("ALTER TABLE devices ADD COLUMN IF NOT EXISTS mode TEXT");
  await pool.query("ALTER TABLE devices ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ");
  await pool.query("ALTER TABLE devices ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP");
  await pool.query("ALTER TABLE devices ADD COLUMN IF NOT EXISTS location TEXT DEFAULT ''");
  await pool.query("ALTER TABLE devices ADD COLUMN IF NOT EXISTS idle_time INTEGER NOT NULL DEFAULT 30");
  await pool.query("ALTER TABLE devices ADD COLUMN IF NOT EXISTS android_version TEXT");
  await pool.query("ALTER TABLE devices ADD COLUMN IF NOT EXISTS manufacturer TEXT");
  await pool.query("ALTER TABLE devices ADD COLUMN IF NOT EXISTS model TEXT");
  await pool.query("ALTER TABLE devices ADD COLUMN IF NOT EXISTS brand TEXT");
  await pool.query("ALTER TABLE devices ADD COLUMN IF NOT EXISTS device_group TEXT DEFAULT 'PRODUCTION'");
  await pool.query("ALTER TABLE devices ADD COLUMN IF NOT EXISTS tags JSONB NOT NULL DEFAULT '[]'::jsonb");
  await pool.query("ALTER TABLE devices ADD COLUMN IF NOT EXISTS environment TEXT DEFAULT 'PRODUCTION'");
  await pool.query("ALTER TABLE devices ADD COLUMN IF NOT EXISTS agent_hidden BOOLEAN DEFAULT false");
  await pool.query("ALTER TABLE devices ADD COLUMN IF NOT EXISTS maintenance_mode BOOLEAN DEFAULT false");
  await pool.query("ALTER TABLE devices ADD COLUMN IF NOT EXISTS scheduled_power_on TEXT");
  await pool.query("ALTER TABLE devices ADD COLUMN IF NOT EXISTS scheduled_power_off TEXT");
  await pool.query("ALTER TABLE devices ADD COLUMN IF NOT EXISTS auto_sync_interval_minutes INTEGER DEFAULT 10");
  await pool.query("ALTER TABLE devices ADD COLUMN IF NOT EXISTS config_updated_at TIMESTAMPTZ");
  await pool.query("ALTER TABLE devices ADD COLUMN IF NOT EXISTS last_screenshot_url TEXT");
  await pool.query("ALTER TABLE devices ADD COLUMN IF NOT EXISTS last_screenshot_at TIMESTAMPTZ");
  await pool.query("ALTER TABLE devices ADD COLUMN IF NOT EXISTS uptime_ms BIGINT");
  await pool.query("ALTER TABLE devices ADD COLUMN IF NOT EXISTS temperature_c NUMERIC");
  await pool.query("ALTER TABLE devices ADD COLUMN IF NOT EXISTS ram_used_mb INTEGER");
  await pool.query("ALTER TABLE devices ADD COLUMN IF NOT EXISTS ram_total_mb INTEGER");
  await pool.query("ALTER TABLE devices ADD COLUMN IF NOT EXISTS storage_free_mb INTEGER");
  await pool.query("ALTER TABLE devices ADD COLUMN IF NOT EXISTS storage_total_mb INTEGER");
  await pool.query("ALTER TABLE devices ADD COLUMN IF NOT EXISTS battery_level INTEGER");
  await pool.query("ALTER TABLE devices ADD COLUMN IF NOT EXISTS battery_charging BOOLEAN");
  await pool.query("ALTER TABLE devices ADD COLUMN IF NOT EXISTS service_running BOOLEAN");
  await pool.query("ALTER TABLE devices ADD COLUMN IF NOT EXISTS monitoring_enabled BOOLEAN");
  await pool.query("ALTER TABLE devices ADD COLUMN IF NOT EXISTS device_owner BOOLEAN");
  await pool.query("ALTER TABLE devices ADD COLUMN IF NOT EXISTS lock_task_active BOOLEAN");
  await pool.query("ALTER TABLE devices ADD COLUMN IF NOT EXISTS last_event TEXT");
  await pool.query("ALTER TABLE devices ADD COLUMN IF NOT EXISTS latency_ms INTEGER");
  await pool.query("ALTER TABLE devices ADD COLUMN IF NOT EXISTS heartbeat_signature TEXT");
  await pool.query("ALTER TABLE devices ADD COLUMN IF NOT EXISTS last_boot_at TIMESTAMPTZ");
  await pool.query("ALTER TABLE devices ALTER COLUMN status SET DEFAULT 'offline'");
  await pool.query("ALTER TABLE devices ALTER COLUMN mode SET DEFAULT 'SCREEN_OFF'");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS commands (
      id SERIAL PRIMARY KEY,
      device_id TEXT,
      action TEXT,
      executed BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query("ALTER TABLE commands ALTER COLUMN device_id TYPE TEXT USING device_id::TEXT");
  await pool.query("ALTER TABLE commands ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb");
  await pool.query("ALTER TABLE commands ALTER COLUMN executed SET DEFAULT false");
  await pool.query("ALTER TABLE commands ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS logs (
      id SERIAL PRIMARY KEY,
      device_id TEXT,
      event TEXT,
      details TEXT,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS heartbeats (
      id SERIAL PRIMARY KEY,
      device_id TEXT,
      status TEXT,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query("ALTER TABLE heartbeats ADD COLUMN IF NOT EXISTS uptime_ms BIGINT");
  await pool.query("ALTER TABLE heartbeats ADD COLUMN IF NOT EXISTS heartbeat_signature TEXT");
  await pool.query("ALTER TABLE heartbeats ADD COLUMN IF NOT EXISTS latency_ms INTEGER");
  await pool.query("ALTER TABLE heartbeats ADD COLUMN IF NOT EXISTS details JSONB NOT NULL DEFAULT '{}'::jsonb");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS metrics (
      id SERIAL PRIMARY KEY,
      device_id TEXT,
      uptime_ms BIGINT,
      ram_used_mb INTEGER,
      ram_total_mb INTEGER,
      storage_free_mb INTEGER,
      storage_total_mb INTEGER,
      battery_level INTEGER,
      temperature_c NUMERIC,
      latency_ms INTEGER,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS alerts (
      id SERIAL PRIMARY KEY,
      device_id TEXT,
      severity TEXT,
      type TEXT,
      message TEXT,
      resolved BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS device_schedules (
      id SERIAL PRIMARY KEY,
      device_id TEXT,
      power_on TEXT,
      power_off TEXT,
      timezone TEXT DEFAULT 'America/Bogota',
      enabled BOOLEAN DEFAULT true,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS screenshots (
      id SERIAL PRIMARY KEY,
      device_id TEXT,
      status TEXT DEFAULT 'requested',
      image_url TEXT,
      details JSONB NOT NULL DEFAULT '{}'::jsonb,
      requested_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      captured_at TIMESTAMPTZ
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS freezes (
      id SERIAL PRIMARY KEY,
      device_id TEXT,
      reason TEXT,
      detected_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      resolved_at TIMESTAMPTZ
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS events (
      id SERIAL PRIMARY KEY,
      device_id TEXT,
      type TEXT,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'admin'
    )
  `);
}

module.exports = {
  ensureSchema
};

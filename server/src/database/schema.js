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

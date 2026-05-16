CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS devices (
    id UUID PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    location VARCHAR(120) DEFAULT '',
    status VARCHAR(20) NOT NULL DEFAULT 'offline',
    last_seen TIMESTAMPTZ,
    ip VARCHAR(120) DEFAULT '',
    idle_time INTEGER NOT NULL DEFAULT 30,
    mode VARCHAR(80) NOT NULL DEFAULT 'SCREEN_OFF',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE devices
    ADD COLUMN IF NOT EXISTS ip VARCHAR(120) DEFAULT '';

CREATE TABLE IF NOT EXISTS commands (
    id SERIAL PRIMARY KEY,
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    action VARCHAR(80) NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    executed BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(80) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(40) NOT NULL DEFAULT 'admin'
);

INSERT INTO users (username, password, role)
SELECT
    'admin',
    '$2a$10$EBn9wtQMit3G7jzGOJErwuk8WNetlIqcmmTg3T681aGdtcqpbSOu.',
    'admin'
WHERE NOT EXISTS (
    SELECT 1 FROM users WHERE username = 'admin'
);

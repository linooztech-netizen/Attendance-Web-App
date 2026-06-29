-- ============================================================
-- Run this ONCE in your Supabase project → SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  email       TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role        TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'oe')),
  manager_id  BIGINT REFERENCES users(id),
  store_id    BIGINT,
  is_active   INTEGER DEFAULT 1,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stores (
  id            BIGSERIAL PRIMARY KEY,
  store_code    TEXT UNIQUE NOT NULL,
  name          TEXT DEFAULT '',
  latitude      DOUBLE PRECISION NOT NULL,
  longitude     DOUBLE PRECISION NOT NULL,
  radius_meters INTEGER DEFAULT 100,
  created_by    BIGINT REFERENCES users(id),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS attendance (
  id                 BIGSERIAL PRIMARY KEY,
  user_id            BIGINT NOT NULL REFERENCES users(id),
  store_id           BIGINT REFERENCES stores(id),
  check_in_time      TIMESTAMPTZ,
  check_out_time     TIMESTAMPTZ,
  check_in_lat       DOUBLE PRECISION,
  check_in_lng       DOUBLE PRECISION,
  check_out_lat      DOUBLE PRECISION,
  check_out_lng      DOUBLE PRECISION,
  check_in_distance  DOUBLE PRECISION,
  check_out_distance DOUBLE PRECISION,
  date               TEXT NOT NULL,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS roster (
  id          BIGSERIAL PRIMARY KEY,
  oe_id       BIGINT NOT NULL REFERENCES users(id),
  store_id    BIGINT REFERENCES stores(id),
  date        TEXT NOT NULL,
  shift_start TEXT,
  shift_end   TEXT,
  notes       TEXT,
  day_type    TEXT DEFAULT 'normal',
  created_by  BIGINT REFERENCES users(id),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (oe_id, date)
);

-- Migration: multi-store support
CREATE TABLE IF NOT EXISTS oe_stores (
  id         BIGSERIAL PRIMARY KEY,
  oe_id      BIGINT NOT NULL REFERENCES users(id),
  store_id   BIGINT NOT NULL REFERENCES stores(id),
  UNIQUE (oe_id, store_id)
);

-- Migration: add day_type to existing roster table
ALTER TABLE roster ADD COLUMN IF NOT EXISTS day_type TEXT DEFAULT 'normal';

-- Migration: add device columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS device_fingerprint TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS device_name TEXT;

-- Migration: device_requests table
CREATE TABLE IF NOT EXISTS device_requests (
  id                 BIGSERIAL PRIMARY KEY,
  oe_id              BIGINT NOT NULL REFERENCES users(id),
  device_fingerprint TEXT NOT NULL,
  device_name        TEXT,
  status             TEXT DEFAULT 'pending',
  requested_at       TIMESTAMPTZ DEFAULT NOW(),
  approved_by        BIGINT REFERENCES users(id),
  approved_at        TIMESTAMPTZ
);

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
  created_by  BIGINT REFERENCES users(id),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (oe_id, date)
);

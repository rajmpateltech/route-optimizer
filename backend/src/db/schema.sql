-- RouteOptimizer schema
-- Applied idempotently on backend startup (see src/db/migrate.ts).

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS jobs (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name                 TEXT NOT NULL,
  country              TEXT NOT NULL DEFAULT '',
  start_address        TEXT NOT NULL DEFAULT '',
  status               TEXT NOT NULL DEFAULT 'uploaded',
  phase                TEXT,
  progress             INT  NOT NULL DEFAULT 0,
  message              TEXT,
  error                TEXT,
  total_stops          INT  NOT NULL DEFAULT 0,
  total_distance_km    DOUBLE PRECISION,
  total_duration_min   DOUBLE PRECISION,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_jobs_user ON jobs(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS stops (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id            UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  input_index       INT  NOT NULL,
  label             TEXT,
  address           TEXT NOT NULL,
  lat               DOUBLE PRECISION,
  lng               DOUBLE PRECISION,
  geocode_status    TEXT NOT NULL DEFAULT 'pending',
  geocode_confidence DOUBLE PRECISION,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stops_job ON stops(job_id, input_index);

-- Global geocoding cache (address -> coordinate), shared across users/jobs.
CREATE TABLE IF NOT EXISTS cache_geocode (
  normalized_address TEXT PRIMARY KEY,
  lat                DOUBLE PRECISION NOT NULL,
  lng                DOUBLE PRECISION NOT NULL,
  label              TEXT,
  confidence         DOUBLE PRECISION,
  source             TEXT NOT NULL DEFAULT 'nominatim',
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Global matrix cache (pair of snapped coordinates -> travel time / distance).
CREATE TABLE IF NOT EXISTS cache_matrix (
  key         TEXT PRIMARY KEY,
  distance_m  INT NOT NULL,
  duration_s  INT NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Full travel matrix for a job, stored as little-endian float32 arrays
-- (row-major NxN). Read by the optimizer service (OR-Tools).
CREATE TABLE IF NOT EXISTS matrices (
  job_id    UUID PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
  n         INT NOT NULL,
  distances BYTEA NOT NULL,
  durations BYTEA NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Final optimized result for a job.
CREATE TABLE IF NOT EXISTS results (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id             UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  ordered_stops      JSONB NOT NULL,
  geometry           JSONB NOT NULL,
  steps              JSONB NOT NULL,
  legs               JSONB NOT NULL DEFAULT '[]',
  total_distance_km  DOUBLE PRECISION NOT NULL,
  total_duration_min DOUBLE PRECISION NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Additive migration for databases created before `legs` existed.
ALTER TABLE results ADD COLUMN IF NOT EXISTS legs JSONB NOT NULL DEFAULT '[]';

-- Additive migration for databases created before `country` existed.
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS country TEXT NOT NULL DEFAULT '';

-- Additive migration for databases created before `start_address` existed.
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS start_address TEXT NOT NULL DEFAULT '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_results_job ON results(job_id);

-- Tap In schema. Safe to run repeatedly. The scans_per_10min continuous aggregate is added by Avery below.
CREATE TABLE IF NOT EXISTS people (
  id SERIAL PRIMARY KEY, uid TEXT UNIQUE, name TEXT NOT NULL,
  role TEXT DEFAULT 'student', skills TEXT[], looking_for TEXT[], working_on TEXT,
  focus BOOLEAN DEFAULT false, note TEXT, color TEXT, points INT DEFAULT 0,
  last_checkin TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS groups (
  id SERIAL PRIMARY KEY, name TEXT, station_id INT, mode TEXT DEFAULT 'open',
  looking_for TEXT[], working_on TEXT, points INT DEFAULT 0, created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS group_members (
  group_id INT, person_id INT, joined_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (group_id, person_id)
);
CREATE TABLE IF NOT EXISTS connections (
  id SERIAL PRIMARY KEY, person_a INT, person_b INT, strength INT DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(), last_seen TIMESTAMPTZ DEFAULT now(),
  UNIQUE (person_a, person_b), CHECK (person_a < person_b)
);
CREATE TABLE IF NOT EXISTS needs (
  id SERIAL PRIMARY KEY, group_id INT, need TEXT,
  since TIMESTAMPTZ DEFAULT now(), handled_by INT
);
CREATE TABLE IF NOT EXISTS taps (
  ts TIMESTAMPTZ NOT NULL DEFAULT now(), station_id INT, uid TEXT, result TEXT
);
SELECT create_hypertable('taps', 'ts', if_not_exists => TRUE);
CREATE TABLE IF NOT EXISTS scan_events (
  ts TIMESTAMPTZ NOT NULL DEFAULT now(), station_id INT,
  kind TEXT, size INT, group_id INT
);
SELECT create_hypertable('scan_events', 'ts', if_not_exists => TRUE);

-- Avery: scans per station and kind in 10-minute buckets, read by /api/stats. Continuous aggregate on scan_events.
-- Safe to re-run on every start: IF NOT EXISTS, WITH NO DATA (allowed inside the startup transaction) and
-- if_not_exists on the policy. materialized_only = false adds the newest minutes live, so the chart never lags.
CREATE MATERIALIZED VIEW IF NOT EXISTS scans_per_10min
WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
SELECT time_bucket(INTERVAL '10 minutes', ts) AS bucket, station_id, kind, count(*) AS n
FROM scan_events GROUP BY bucket, station_id, kind WITH NO DATA;

SELECT add_continuous_aggregate_policy('scans_per_10min',
  start_offset => INTERVAL '3 hours', end_offset => INTERVAL '1 minute',
  schedule_interval => INTERVAL '1 minute', if_not_exists => true);

-- Avery: the same scans per hour, built ON TOP of scans_per_10min (a hierarchical continuous aggregate), read by
-- /api/analytics for the Spark view: busiest station by hour and the mix of scan kinds. Real-time like the base.
CREATE MATERIALIZED VIEW IF NOT EXISTS scans_per_hour
WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
SELECT time_bucket(INTERVAL '1 hour', bucket) AS hour, station_id, kind, sum(n)::bigint AS n
FROM scans_per_10min GROUP BY hour, station_id, kind WITH NO DATA;

SELECT add_continuous_aggregate_policy('scans_per_hour',
  start_offset => INTERVAL '3 hours', end_offset => INTERVAL '10 minutes',
  schedule_interval => INTERVAL '5 minutes', if_not_exists => true);

-- Optional contact (Instagram or LinkedIn) from sign-up. Stored only; no API returns it during the event.
ALTER TABLE people ADD COLUMN IF NOT EXISTS contact TEXT;

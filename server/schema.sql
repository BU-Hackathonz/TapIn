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

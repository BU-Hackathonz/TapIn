// Links a Google/GitHub login to a Tap In person, in the server's Postgres (the same DATABASE_URL as server/.env).
// Table oauth_links is made here on first use (like server/schema.sql: CREATE TABLE IF NOT EXISTS); no server change needed.
// Without DATABASE_URL every call returns null and sign-in works as before, just without accounts.
let pool = null, ready = null;

function db() {
  const raw = (process.env.DATABASE_URL || "").trim();
  if (!raw) return null;
  if (!pool) {
    const { Pool } = require("pg");
    const url = new URL(raw);
    url.searchParams.delete("sslmode");                       // TLS is set below; pg would otherwise insist on full CA checks
    pool = new Pool({ connectionString: url.toString(), ssl: { rejectUnauthorized: false }, max: 2, idleTimeoutMillis: 10000 });
  }
  if (!ready) ready = pool.query(`CREATE TABLE IF NOT EXISTS oauth_links (
      oauth_id TEXT PRIMARY KEY, person_id INT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
      email TEXT, created_at TIMESTAMPTZ DEFAULT now())`).catch((e) => { ready = null; throw e; });
  return pool;
}

const PERSON = "p.id, p.name, p.role, p.skills, p.looking_for, p.working_on";

// the person this login belongs to, or null (also null when there's no database)
async function personFor(oauthId) {
  const p = db(); if (!p) return null;
  await ready;
  const r = await p.query(`SELECT ${PERSON} FROM oauth_links l JOIN people p ON p.id = l.person_id WHERE l.oauth_id = $1`, [oauthId]);
  return r.rows[0] || null;
}

// link a login to a person (a later link for the same login moves it); returns the person, or null if no such person
async function link(oauthId, personId, email) {
  const p = db(); if (!p) return null;
  await ready;
  const r = await p.query(`SELECT ${PERSON} FROM people p WHERE p.id = $1`, [personId]);
  if (!r.rows[0]) return null;
  await p.query(`INSERT INTO oauth_links (oauth_id, person_id, email) VALUES ($1, $2, $3)
                 ON CONFLICT (oauth_id) DO UPDATE SET person_id = EXCLUDED.person_id, email = EXCLUDED.email, created_at = now()`,
                [oauthId, personId, email || null]);
  return r.rows[0];
}

module.exports = { enabled: () => !!(process.env.DATABASE_URL || "").trim(), personFor, link };

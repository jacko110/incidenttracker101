#!/usr/bin/env node
/**
 * Migrates all data from the local SQLite database (backend/nib.db) into
 * a Postgres database that already has postgres/schema.sql applied.
 *
 * This does NOT touch application code — the Express routes still talk to
 * SQLite via better-sqlite3 (see the caveat in postgres/README.md). This
 * script is for moving your *data* to Postgres, e.g. as a first step before
 * porting the routes, or to stand up a Postgres replica for reporting.
 *
 * Usage:
 *   1. createdb nib   (or your own db name)
 *   2. psql -d nib -f postgres/schema.sql
 *   3. DATABASE_URL=postgres://user:pass@host:5432/nib node postgres/migrate-data.js
 *
 * Safe to re-run: it TRUNCATEs the target tables first (in FK-safe order)
 * before inserting, so partial/failed runs don't leave duplicate data.
 */

const path = require("path");
const Database = require("better-sqlite3");
const { Client } = require("pg");

const SQLITE_PATH = process.env.SQLITE_PATH || path.join(__dirname, "..", "nib.db");
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("Set DATABASE_URL to your Postgres connection string, e.g.");
  console.error("  DATABASE_URL=postgres://user:pass@localhost:5432/nib node postgres/migrate-data.js");
  process.exit(1);
}

// Tables in FK-dependency order (parents before children) for inserts,
// and the reverse for the pre-migration TRUNCATE.
const TABLES_IN_ORDER = [
  "users",
  "cases",
  "case_notes",
  "chat_messages",
  "case_history",
  "iocs",
  "notifications",
  "email_log",
  "case_links",
];

// SQLite stores booleans as 0/1 integers; Postgres wants real booleans.
const BOOLEAN_COLUMNS = {
  users: ["active", "email_notifications"],
  cases: ["archived"],
  notifications: ["read"],
};

// SQLite stores these as TEXT-encoded JSON; Postgres columns are JSONB.
const JSON_COLUMNS = {
  cases: ["source_ip", "destination_ip", "http_status", "iocs"],
  iocs: ["images", "documents"],
};

function toBoolean(v) {
  return v === 1 || v === true;
}

function toJsonStringOrNull(v) {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "string") {
    // Already a JSON string from SQLite (e.g. '["1.2.3.4"]') — validate it
    // parses, but pass the original string through so pg can cast it to jsonb.
    try {
      JSON.parse(v);
      return v;
    } catch {
      return null; // malformed JSON in the source — don't crash the migration
    }
  }
  return JSON.stringify(v); // already a JS value — stringify for the jsonb param
}

function transformRow(table, row) {
  const out = { ...row };
  for (const col of BOOLEAN_COLUMNS[table] || []) {
    if (col in out) out[col] = toBoolean(out[col]);
  }
  for (const col of JSON_COLUMNS[table] || []) {
    if (col in out) out[col] = toJsonStringOrNull(out[col]);
  }
  return out;
}

async function main() {
  const sqlite = new Database(SQLITE_PATH, { readonly: true });
  const pg = new Client({ connectionString: DATABASE_URL });
  await pg.connect();

  console.log(`Source (SQLite): ${SQLITE_PATH}`);
  console.log(`Target (Postgres): ${DATABASE_URL.replace(/:[^:@]*@/, ":***@")}`);
  console.log("");

  try {
    // TRUNCATE in reverse dependency order so FK constraints don't block it,
    // and RESTART IDENTITY so the Postgres SERIAL sequences don't drift from
    // the ids we're about to insert explicitly.
    console.log("Clearing target tables...");
    for (const table of [...TABLES_IN_ORDER].reverse()) {
      await pg.query(`TRUNCATE TABLE ${table} RESTART IDENTITY CASCADE`);
    }

    let totalRows = 0;

    for (const table of TABLES_IN_ORDER) {
      const rows = sqlite.prepare(`SELECT * FROM ${table}`).all();
      if (rows.length === 0) {
        console.log(`  ${table}: 0 rows (skipped)`);
        continue;
      }

      const columns = Object.keys(rows[0]);
      const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
      const insertSql = `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})`;

      for (const rawRow of rows) {
        const row = transformRow(table, rawRow);
        const values = columns.map((c) => row[c]);
        await pg.query(insertSql, values);
      }

      // Bring the SERIAL sequence up to date with the explicit ids we just
      // inserted, so future INSERTs (without an explicit id) don't collide.
      await pg.query(
        `SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE((SELECT MAX(id) FROM ${table}), 1))`
      );

      console.log(`  ${table}: ${rows.length} rows migrated`);
      totalRows += rows.length;
    }

    console.log("");
    console.log(`Done. ${totalRows} total rows migrated.`);
  } finally {
    sqlite.close();
    await pg.end();
  }
}

main().catch((err) => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});

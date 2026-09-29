# Moving to Postgres

This app runs on SQLite (`better-sqlite3`) by default — zero setup, one
file, good enough for a single-server deployment. This directory gives you
a tested path to move your **data** to Postgres.

## Important: what this does and doesn't do

**`schema.sql`** and **`migrate-data.js`** move your data faithfully into a
real Postgres database. That part is done and tested.

**What this does NOT do**: make the Express app talk to Postgres instead of
SQLite. `better-sqlite3` is synchronous; the `pg` driver is
promise-based/async. Every route in `backend/routes/*.js` currently calls
`db.prepare(...).get()/.all()/.run()` synchronously. Swapping the driver
means converting every one of those call sites to `await`, which is a real
(if mechanical) piece of work — not something to do silently as a drive-by
change to a codebase that's already tested against SQLite.

If you want that conversion done, it's a reasonable next step — just ask
for it explicitly so it gets its own testing pass, the same way every other
feature in this app did.

## Steps

### 1. Create the database and apply the schema

```bash
createdb nib
psql -d nib -f postgres/schema.sql
```

Or against a remote/managed Postgres:

```bash
psql "postgres://user:pass@host:5432/nib" -f postgres/schema.sql
```

### 2. Install the Postgres driver

```bash
cd backend
npm install pg
```

(`pg` isn't a default dependency of this project — it's only needed if you
run this migration.)

### 3. Run the migration

```bash
DATABASE_URL=postgres://user:pass@host:5432/nib node postgres/migrate-data.js
```

This reads every row out of `backend/nib.db` and inserts it into Postgres,
preserving original IDs (so foreign keys stay valid) and converting:
- SQLite's 0/1 integers → real Postgres `BOOLEAN`
- SQLite's TEXT-encoded JSON → real Postgres `JSONB`
- SQLite's text timestamps → Postgres `TIMESTAMPTZ`

It's safe to re-run — it truncates the target tables first, so a failed or
partial run doesn't leave duplicate rows.

## Schema differences from `db.js` (SQLite)

| SQLite | Postgres | Why |
|---|---|---|
| `INTEGER PRIMARY KEY AUTOINCREMENT` | `SERIAL PRIMARY KEY` | Postgres equivalent |
| `INTEGER` (0/1) for booleans | `BOOLEAN` | Postgres has a real boolean type |
| `TEXT DEFAULT CURRENT_TIMESTAMP` | `TIMESTAMPTZ DEFAULT NOW()` | Real timestamp type, not a string |
| `TEXT` holding JSON | `JSONB` | Indexable/queryable JSON in Postgres |
| Foreign keys (unenforced — `better-sqlite3` doesn't set `PRAGMA foreign_keys=ON` in `db.js`) | Foreign keys (enforced) | Postgres enforces by default |

Indexes were also added on columns this app filters/joins on frequently
(`cases.status`, `iocs.value`, etc.) — SQLite's file-based nature and this
app's data volume made them unnecessary there, but they matter more under
real concurrent load on a shared Postgres instance.

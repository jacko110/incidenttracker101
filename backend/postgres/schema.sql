-- Postgres translation of backend/db.js's SQLite schema.
--
-- Differences from the SQLite version, and why:
--   * INTEGER PRIMARY KEY AUTOINCREMENT -> SERIAL PRIMARY KEY
--   * SQLite has no real boolean type (0/1 INTEGER) -> BOOLEAN here, which
--     is more correct in Postgres and what migrate-data.js converts to
--   * TEXT DEFAULT CURRENT_TIMESTAMP -> TIMESTAMPTZ DEFAULT NOW(), since
--     Postgres has a real timestamp type and SQLite's CURRENT_TIMESTAMP is
--     just a text string
--   * TEXT columns holding JSON (source_ip, iocs, images, etc.) -> JSONB,
--     which Postgres can actually index and query into
--   * Foreign keys are genuinely enforced here (SQLite only enforces them
--     if PRAGMA foreign_keys=ON, which better-sqlite3 doesn't set in db.js)
--
-- Run this against a fresh, empty database before running migrate-data.js:
--   psql -h <host> -U <user> -d <database> -f schema.sql

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'SOC_ANALYST',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  email TEXT,
  email_notifications BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cases (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Attempt', -- Under Review | In Progress | Completed | Attempt | Rejected
  severity TEXT DEFAULT 'N/A',            -- Low | Medium | High | Critical | N/A
  attack_type TEXT,
  origin_country TEXT,
  assigned_to INTEGER REFERENCES users(id),
  due_at TIMESTAMPTZ,
  deadline_source TEXT,
  due_reminded_at TIMESTAMPTZ,
  due_escalated_at TIMESTAMPTZ,
  rejected_by TEXT,                       -- 'SOC Admin' | 'IR Analyst' | NULL
  archived BOOLEAN DEFAULT FALSE,
  source_ip JSONB,
  destination_ip JSONB,
  incident_datetime TEXT,
  asset_name TEXT,
  shift TEXT,
  http_status JSONB,
  summary TEXT,
  impact TEXT,
  recommendations TEXT,
  iocs JSONB,                             -- legacy blob, kept for compatibility; see the iocs table below
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS case_notes (
  id SERIAL PRIMARY KEY,
  case_id INTEGER NOT NULL REFERENCES cases(id),
  author_id INTEGER REFERENCES users(id),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS case_history (
  id SERIAL PRIMARY KEY,
  case_id INTEGER NOT NULL REFERENCES cases(id),
  actor_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,
  detail TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS iocs (
  id SERIAL PRIMARY KEY,
  case_id INTEGER NOT NULL REFERENCES cases(id),
  type TEXT NOT NULL,
  value TEXT,
  threat_intelligence TEXT,
  count INTEGER,
  percentage INTEGER,
  description TEXT,
  images JSONB,
  documents JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  case_id INTEGER REFERENCES cases(id),
  message TEXT NOT NULL,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS email_log (
  id SERIAL PRIMARY KEY,
  recipient TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT,
  status TEXT NOT NULL,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS case_links (
  id SERIAL PRIMARY KEY,
  case_id_a INTEGER NOT NULL REFERENCES cases(id),
  case_id_b INTEGER NOT NULL REFERENCES cases(id),
  note TEXT,
  linked_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(case_id_a, case_id_b)
);

-- Useful indexes not present in the SQLite version (SQLite's file-based
-- nature and this app's data volume made them unnecessary there, but a
-- shared Postgres instance under real concurrent load benefits from them).
CREATE INDEX IF NOT EXISTS idx_cases_status ON cases(status);
CREATE INDEX IF NOT EXISTS idx_cases_assigned_to ON cases(assigned_to);
CREATE INDEX IF NOT EXISTS idx_cases_due_at ON cases(due_at) WHERE due_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cases_archived ON cases(archived);
CREATE INDEX IF NOT EXISTS idx_iocs_case_id ON iocs(case_id);
CREATE INDEX IF NOT EXISTS idx_iocs_value ON iocs(value);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id, read);
CREATE INDEX IF NOT EXISTS idx_case_history_case_id ON case_history(case_id);

CREATE TABLE IF NOT EXISTS playbook_templates (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  steps JSONB NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS case_playbooks (
  id SERIAL PRIMARY KEY,
  case_id INTEGER NOT NULL REFERENCES cases(id),
  template_id INTEGER NOT NULL REFERENCES playbook_templates(id),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  attached_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(case_id, template_id)
);
CREATE TABLE IF NOT EXISTS playbook_tasks (
  id SERIAL PRIMARY KEY,
  case_playbook_id INTEGER NOT NULL REFERENCES case_playbooks(id),
  position INTEGER NOT NULL,
  title TEXT NOT NULL,
  assigned_to INTEGER REFERENCES users(id),
  completed_at TIMESTAMPTZ,
  completed_by INTEGER REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_playbook_tasks_parent ON playbook_tasks(case_playbook_id);


CREATE TABLE IF NOT EXISTS sla_policies (
  id SERIAL PRIMARY KEY,
  severity TEXT NOT NULL UNIQUE,
  response_hours INTEGER NOT NULL CHECK(response_hours BETWEEN 1 AND 8760),
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  updated_by INTEGER REFERENCES users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS sla_policy_history (
  id SERIAL PRIMARY KEY,
  actor_id INTEGER REFERENCES users(id),
  policies JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

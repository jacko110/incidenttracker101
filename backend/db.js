const Database = require("better-sqlite3");
const path = require("path");

const db = new Database(process.env.DATABASE_PATH || path.join(__dirname, "nib.db"));
db.pragma("journal_mode = WAL");
db.pragma('busy_timeout = 5000');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'SOC_ANALYST',
  active INTEGER NOT NULL DEFAULT 1,
  email TEXT,
  email_notifications INTEGER NOT NULL DEFAULT 1,
  auth_version INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Attempt', -- Under Review | In Progress | Completed | Attempt | Rejected
  severity TEXT DEFAULT 'N/A',            -- Low | Medium | High | Critical | N/A
  attack_type TEXT,
  origin_country TEXT,
  assigned_to INTEGER,
  due_at TEXT,
  due_reminded_at TEXT,
  rejected_by TEXT,                       -- 'SOC Admin' | 'IR Analyst' | NULL
  archived INTEGER DEFAULT 0,
  source_ip TEXT,           -- JSON array of strings
  destination_ip TEXT,      -- JSON array of strings
  incident_datetime TEXT,
  asset_name TEXT,
  shift TEXT,
  http_status TEXT,         -- JSON array of strings
  summary TEXT,
  impact TEXT,
  recommendations TEXT,
  iocs TEXT,                -- JSON array of {type, value}
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (assigned_to) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS case_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id INTEGER NOT NULL,
  author_id INTEGER,
  body TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (case_id) REFERENCES cases(id),
  FOREIGN KEY (author_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  body TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Audit trail: one row per meaningful change to a case
CREATE TABLE IF NOT EXISTS case_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id INTEGER NOT NULL,
  actor_id INTEGER,
  action TEXT NOT NULL,     -- e.g. 'status_changed', 'rejected', 'assigned', 'edited', 'archived', 'restored', 'created'
  detail TEXT,              -- human-readable description of what changed
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (case_id) REFERENCES cases(id),
  FOREIGN KEY (actor_id) REFERENCES users(id)
);

-- Real, queryable IOC records (separate from the JSON blob kept on cases.iocs
-- for backward compatibility with the wizard's draft payload)
CREATE TABLE IF NOT EXISTS iocs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id INTEGER NOT NULL,
  type TEXT NOT NULL,               -- IP Address | Domain | URL | File Hash | Email
  value TEXT,                       -- the actual indicator, e.g. an IP or domain
  threat_intelligence TEXT,
  count INTEGER,
  percentage INTEGER,
  description TEXT,
  images TEXT,                      -- JSON array of {originalName, url, ...}
  documents TEXT,                   -- JSON array of {originalName, url, ...}
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (case_id) REFERENCES cases(id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,     -- recipient
  case_id INTEGER,
  message TEXT NOT NULL,
  read INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (case_id) REFERENCES cases(id)
);

-- Every email attempt, real or dev-logged, so behavior is auditable/testable
-- even without a configured SMTP server (see backend/services/email.js)
CREATE TABLE IF NOT EXISTS email_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipient TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT,
  status TEXT NOT NULL,     -- 'sent' | 'logged (no SMTP configured)' | 'failed'
  error TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Many-to-many links between related cases (e.g. incidents from the same
-- campaign). Stored as one row per pair with the smaller id first so a
-- link between A and B can't be duplicated as both (A,B) and (B,A).
CREATE TABLE IF NOT EXISTS case_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id_a INTEGER NOT NULL,
  case_id_b INTEGER NOT NULL,
  note TEXT,
  linked_by INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (case_id_a) REFERENCES cases(id),
  FOREIGN KEY (case_id_b) REFERENCES cases(id),
  FOREIGN KEY (linked_by) REFERENCES users(id),
  UNIQUE(case_id_a, case_id_b)
);
`);

if (!db.prepare('PRAGMA table_info(users)').all().some(column => column.name === 'auth_version')) {
  db.exec('ALTER TABLE users ADD COLUMN auth_version INTEGER NOT NULL DEFAULT 0');
}
// Safe migration in case an older nib.db already exists without these columns
const newColumns = [
  "rejected_by TEXT",
  "due_at TEXT",
  "deadline_source TEXT",
  "due_reminded_at TEXT",
  "due_escalated_at TEXT",
  "source_ip TEXT",
  "destination_ip TEXT",
  "incident_datetime TEXT",
  "asset_name TEXT",
  "shift TEXT",
  "http_status TEXT",
  "summary TEXT",
  "impact TEXT",
  "recommendations TEXT",
  "iocs TEXT",
];
for (const col of newColumns) {
  try {
    db.exec(`ALTER TABLE cases ADD COLUMN ${col}`);
  } catch (e) {
    // column already exists — ignore
  }
}
try {
  db.exec("ALTER TABLE users ADD COLUMN active INTEGER NOT NULL DEFAULT 1");
} catch (e) {
  // column already exists — ignore
}
try {
  db.exec("ALTER TABLE users ADD COLUMN email TEXT");
} catch (e) {
  // column already exists — ignore
}
try {
  db.exec("ALTER TABLE users ADD COLUMN email_notifications INTEGER NOT NULL DEFAULT 1");
} catch (e) {
  // column already exists — ignore
}

db.exec(`
CREATE TABLE IF NOT EXISTS playbook_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  steps TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS case_playbooks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id INTEGER NOT NULL REFERENCES cases(id),
  template_id INTEGER NOT NULL REFERENCES playbook_templates(id),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  attached_by INTEGER REFERENCES users(id),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(case_id, template_id)
);
CREATE TABLE IF NOT EXISTS playbook_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_playbook_id INTEGER NOT NULL REFERENCES case_playbooks(id),
  position INTEGER NOT NULL,
  title TEXT NOT NULL,
  assigned_to INTEGER REFERENCES users(id),
  completed_at TEXT,
  completed_by INTEGER REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_playbook_tasks_parent ON playbook_tasks(case_playbook_id);
`);

db.exec(`
CREATE TABLE IF NOT EXISTS sla_policies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  severity TEXT NOT NULL UNIQUE,
  response_hours INTEGER NOT NULL CHECK(response_hours BETWEEN 1 AND 8760),
  enabled INTEGER NOT NULL DEFAULT 0,
  updated_by INTEGER REFERENCES users(id),
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS sla_policy_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id INTEGER REFERENCES users(id),
  policies TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`);

module.exports = db;

const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

const VALID_ROLES = ["SOC_ANALYST", "SOC_ADMIN", "IR_ANALYST"];

function safeUser(row) {
  if (!row) return row;
  const { password_hash, ...rest } = row;
  return rest;
}

// GET /api/users — admin only
router.get("/", requireRole("SOC_ADMIN"), (req, res) => {
  const rows = db
    .prepare("SELECT id, username, role, active, email, email_notifications, created_at FROM users ORDER BY created_at ASC")
    .all();
  res.json(rows);
});

// POST /api/users — admin only, create a new account
router.post("/", requireRole("SOC_ADMIN"), (req, res) => {
  const { username, password, role, email } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required" });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }
  const finalRole = role && VALID_ROLES.includes(role) ? role : "SOC_ANALYST";

  const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
  if (existing) return res.status(409).json({ error: "That username is already taken" });

  const hash = bcrypt.hashSync(password, 10);
  const info = db
    .prepare("INSERT INTO users (username, password_hash, role, email) VALUES (?, ?, ?, ?)")
    .run(username, hash, finalRole, email || null);

  res.status(201).json(safeUser(db.prepare("SELECT * FROM users WHERE id = ?").get(info.lastInsertRowid)));
});

// PATCH /api/users/:id — admin only, change role / active status / reset password
router.patch("/:id", requireRole("SOC_ADMIN"), (req, res) => {
  const existing = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "User not found" });

  const { role, active, password } = req.body || {};

  if (role && !VALID_ROLES.includes(role)) {
    return res.status(400).json({ error: `role must be one of ${VALID_ROLES.join(", ")}` });
  }
  if (Number(req.params.id) === req.user.id && active === false) {
    return res.status(400).json({ error: "You can't deactivate your own account" });
  }
  if (password && password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }

  const passwordHash = password ? bcrypt.hashSync(password, 10) : null;

  db.prepare(
    `UPDATE users SET
      role = COALESCE(?, role),
      active = COALESCE(?, active),
      password_hash = COALESCE(?, password_hash)
     WHERE id = ?`
  ).run(role ?? null, active === undefined ? null : active ? 1 : 0, passwordHash, req.params.id);

  res.json(safeUser(db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id)));
});

// GET /api/users/email-log — admin only. Lets you verify what notifications
// would have been emailed, without needing real SMTP configured.
router.get("/email-log", requireRole("SOC_ADMIN"), (req, res) => {
  const rows = db
    .prepare("SELECT * FROM email_log ORDER BY created_at DESC LIMIT 100")
    .all();
  res.json(rows);
});

module.exports = router;

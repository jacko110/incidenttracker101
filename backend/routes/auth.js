const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../db");
const { SECRET, requireAuth } = require("../middleware/auth");
const { loginRateLimit, recordFailedAttempt, clearAttempts } = require("../middleware/rateLimit");

const router = express.Router();

router.post("/login", loginRateLimit, (req, res) => {
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || !username.trim() || username.length > 100 ||
      typeof password !== 'string' || !password || Buffer.byteLength(password, 'utf8') > 72) {
    return res.status(400).json({ error: "Username and password required" });
  }
  const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    recordFailedAttempt(req);
    return res.status(401).json({ error: "Invalid credentials" });
  }
  if (user.active === 0) {
    return res.status(403).json({ error: "This account has been deactivated" });
  }
  clearAttempts(req);
  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role, auth_version: user.auth_version },
    SECRET,
    { expiresIn: "8h" }
  );
  res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
});

router.get("/me", requireAuth, (req, res) => {
  const row = db
    .prepare("SELECT id, username, role, email, email_notifications FROM users WHERE id = ?")
    .get(req.user.id);
  res.json({ user: row });
});

// PATCH /api/auth/me — self-service: set your own contact email and
// whether you want email notifications at all. Anyone can edit their own
// email (no admin approval needed) — role/active/username are NOT editable
// here, only through the admin-only /api/users routes.
router.patch("/me", requireAuth, (req, res) => {
  const { email, email_notifications } = req.body || {};
  if (email !== undefined && (typeof email !== 'string' || email.length > 254)) return res.status(400).json({ error: 'Invalid email' });
  if (email_notifications !== undefined && typeof email_notifications !== 'boolean') return res.status(400).json({ error: 'email_notifications must be true or false' });
  db.prepare(
    `UPDATE users SET
      email = COALESCE(?, email),
      email_notifications = COALESCE(?, email_notifications)
     WHERE id = ?`
  ).run(
    email === undefined ? null : email,
    email_notifications === undefined ? null : email_notifications ? 1 : 0,
    req.user.id
  );
  const row = db
    .prepare("SELECT id, username, role, email, email_notifications FROM users WHERE id = ?")
    .get(req.user.id);
  res.json({ user: row });
});

module.exports = router;

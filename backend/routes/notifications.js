const express = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

// GET /api/notifications
router.get("/", (req, res) => {
  const rows = db
    .prepare(
      `SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`
    )
    .all(req.user.id);
  const unread = db
    .prepare("SELECT COUNT(*) c FROM notifications WHERE user_id = ? AND read = 0")
    .get(req.user.id).c;
  res.json({ notifications: rows, unread });
});

// POST /api/notifications/:id/read
router.post("/:id/read", (req, res) => {
  db.prepare("UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?").run(
    req.params.id,
    req.user.id
  );
  res.json({ ok: true });
});

// POST /api/notifications/read-all
router.post("/read-all", (req, res) => {
  db.prepare("UPDATE notifications SET read = 1 WHERE user_id = ?").run(req.user.id);
  res.json({ ok: true });
});

module.exports = router;

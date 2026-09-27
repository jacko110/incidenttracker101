const express = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

router.get("/", (req, res) => {
  const rows = db
    .prepare(
      `SELECT m.*, u.username FROM chat_messages m
       LEFT JOIN users u ON u.id = m.user_id
       ORDER BY m.created_at ASC LIMIT 200`
    )
    .all();
  res.json(rows);
});

router.post("/", (req, res) => {
  const { body } = req.body || {};
  if (!body) return res.status(400).json({ error: "Message body required" });
  const info = db
    .prepare("INSERT INTO chat_messages (user_id, body) VALUES (?, ?)")
    .run(req.user.id, body);
  const row = db.prepare("SELECT * FROM chat_messages WHERE id = ?").get(info.lastInsertRowid);
  res.status(201).json({ ...row, username: req.user.username });
});

module.exports = router;

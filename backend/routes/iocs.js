const express = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

function parseJson(v) {
  if (!v) return [];
  try {
    return JSON.parse(v);
  } catch {
    return [];
  }
}

// GET /api/iocs?q=&type=&page=&pageSize=
// Searches across every IOC ever recorded, joined back to its parent case,
// so an analyst can answer "which cases mention this IP/domain/hash?"
router.get("/", (req, res) => {
  const { q, type, page, pageSize } = req.query;

  const where = [];
  const params = [];

  if (type) {
    where.push("iocs.type = ?");
    params.push(type);
  }
  if (q && q.trim()) {
    where.push("(iocs.value LIKE ? OR iocs.description LIKE ? OR iocs.threat_intelligence LIKE ?)");
    const like = `%${q.trim()}%`;
    params.push(like, like, like);
  }
  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const total = db
    .prepare(`SELECT COUNT(*) c FROM iocs ${whereClause}`)
    .get(...params).c;

  const p = Math.max(1, parseInt(page, 10) || 1);
  const size = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 25));
  const offset = (p - 1) * size;

  const rows = db
    .prepare(
      `SELECT iocs.*, cases.title as case_title, cases.status as case_status, cases.archived as case_archived
       FROM iocs
       JOIN cases ON cases.id = iocs.case_id
       ${whereClause}
       ORDER BY iocs.created_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, size, offset);

  res.json({
    data: rows.map((r) => ({ ...r, images: parseJson(r.images), documents: parseJson(r.documents) })),
    pagination: { page: p, pageSize: size, total, totalPages: Math.max(1, Math.ceil(total / size)) },
  });
});

// GET /api/iocs/types -> distinct IOC types present, for a filter dropdown
router.get("/types", (req, res) => {
  const rows = db
    .prepare("SELECT DISTINCT type FROM iocs WHERE type IS NOT NULL ORDER BY type")
    .all();
  res.json(rows.map((r) => r.type));
});

module.exports = router;

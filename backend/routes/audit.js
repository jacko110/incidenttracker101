const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireRole('SOC_ADMIN'));
const ACTIONS = [
  'created', 'status_changed', 'rejected', 'assigned', 'edited', 'deadline_changed',
  'deadline_escalated', 'archived', 'restored', 'playbook_attached',
  'playbook_task_assigned', 'playbook_task_completed', 'playbook_task_reopened',
];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function validDate(value) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function getFilters(query) {
  const { from = '', to = '', action = '', q = '' } = query;
  if ((from && !validDate(from)) || (to && !validDate(to))) {
    return { error: 'from and to must be valid dates in YYYY-MM-DD format' };
  }
  if (from && to && from > to) return { error: 'from must be on or before to' };
  if (action && !ACTIONS.includes(action)) return { error: 'Unknown activity action' };
  if (typeof q !== 'string' || q.length > 200) return { error: 'Search query must be 200 characters or fewer' };

  const where = [];
  const params = [];
  if (from) { where.push('h.created_at >= ?'); params.push(from); }
  if (to) { where.push('h.created_at <= ?'); params.push(`${to} 23:59:59`); }
  if (action) { where.push('h.action = ?'); params.push(action); }
  if (q.trim()) {
    where.push(`(c.title LIKE ? OR h.detail LIKE ? OR u.username LIKE ? OR CAST(c.id AS TEXT) = ?)`);
    const like = `%${q.trim()}%`;
    params.push(like, like, like, q.trim());
  }
  return { where: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

function csvCell(value) {
  let text = value == null ? '' : String(value);
  if (/^[=+@\-\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

const SELECT = `SELECT h.id, h.case_id, c.title AS case_title, h.created_at,
  COALESCE(u.username, 'System') AS actor, h.action, h.detail
  FROM case_history h JOIN cases c ON c.id = h.case_id
  LEFT JOIN users u ON u.id = h.actor_id`;

router.get('/history', (req, res) => {
  const filters = getFilters(req.query);
  if (filters.error) return res.status(400).json({ error: filters.error });
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(req.query.pageSize, 10) || 25));
  const offset = (page - 1) * pageSize;
  const total = db.prepare(`SELECT COUNT(*) AS count FROM case_history h JOIN cases c ON c.id=h.case_id LEFT JOIN users u ON u.id=h.actor_id ${filters.where}`)
    .get(...filters.params).count;
  const rows = db.prepare(`${SELECT} ${filters.where} ORDER BY h.created_at DESC, h.id DESC LIMIT ? OFFSET ?`)
    .all(...filters.params, pageSize, offset);
  res.json({ data: rows, pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } });
});

router.get('/history/export', (req, res) => {
  const filters = getFilters(req.query);
  if (filters.error) return res.status(400).json({ error: filters.error });
  const rows = db.prepare(`${SELECT} ${filters.where} ORDER BY h.created_at ASC, h.id ASC`).all(...filters.params);
  const lines = [['case_id', 'case_title', 'occurred_at_utc', 'actor', 'action', 'details']];
  for (const row of rows) lines.push([row.case_id, row.case_title, row.created_at, row.actor, row.action, row.detail]);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="case-activity-history.csv"');
  res.send('\uFEFF' + lines.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n');
});

module.exports = router;

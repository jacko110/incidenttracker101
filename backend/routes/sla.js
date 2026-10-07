const router = require('express').Router();
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { SEVERITIES, applyPolicy } = require('../services/sla');
router.use(requireAuth, requireRole('SOC_ADMIN'));
router.get('/sla', (req, res) => res.json(db.prepare('SELECT * FROM sla_policies ORDER BY response_hours').all()));
router.get('/sla/history', (req, res) => {
  const severity = req.query.severity || '';
  if (severity && !SEVERITIES.includes(severity)) {
    return res.status(400).json({ error: 'severity must be Critical, High, Medium, or Low' });
  }
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(50, Math.max(1, Number.parseInt(req.query.pageSize, 10) || 10));
  const offset = (page - 1) * pageSize;
  const filter = severity ? `WHERE EXISTS (
    SELECT 1 FROM json_each(h.policies) policy
    WHERE json_extract(policy.value, '$.severity') = ?
  )` : '';
  const params = severity ? [severity] : [];
  const total = db.prepare(`SELECT COUNT(*) AS count FROM sla_policy_history h ${filter}`).get(...params).count;
  const rows = db.prepare(`SELECT h.id, h.policies, h.created_at, u.username AS actor
    FROM sla_policy_history h LEFT JOIN users u ON u.id = h.actor_id
    ${filter} ORDER BY h.created_at DESC, h.id DESC LIMIT ? OFFSET ?`)
    .all(...params, pageSize, offset);
  res.json({
    data: rows.map(row => ({ ...row, policies: JSON.parse(row.policies).filter(policy => !severity || policy.severity === severity) })),
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  });
});
router.get('/sla/history/export', (req, res) => {
  const severity = req.query.severity || '';
  if (severity && !SEVERITIES.includes(severity)) {
    return res.status(400).json({ error: 'severity must be Critical, High, Medium, or Low' });
  }
  const filter = severity ? `WHERE EXISTS (
    SELECT 1 FROM json_each(h.policies) policy
    WHERE json_extract(policy.value, '$.severity') = ?
  )` : '';
  const records = db.prepare(`SELECT h.id, h.policies, h.created_at, u.username AS actor
    FROM sla_policy_history h LEFT JOIN users u ON u.id = h.actor_id
    ${filter} ORDER BY h.created_at ASC, h.id ASC`).all(...(severity ? [severity] : []));
  const cell = value => {
    let text = value == null ? '' : String(value);
    if (/^[=+@\-\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  const lines = [['history_id', 'changed_at_utc', 'changed_by', 'severity', 'response_hours', 'enabled']];
  for (const record of records) {
    const policies = JSON.parse(record.policies).filter(policy => !severity || policy.severity === severity);
    for (const policy of policies) {
      lines.push([record.id, record.created_at, record.actor || 'Unknown user', policy.severity,
        policy.response_hours, policy.enabled ? 'true' : 'false']);
    }
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="sla-policy-history-${severity || 'all'}.csv"`);
  res.send('\uFEFF' + lines.map(row => row.map(cell).join(',')).join('\r\n') + '\r\n');
});
router.put('/sla', (req, res) => {
  const policies = req.body?.policies;
  if (!Array.isArray(policies) || policies.length !== 4 || new Set(policies.map(p => p?.severity)).size !== 4 ||
      policies.some(p => !p || !SEVERITIES.includes(p.severity) || typeof p.enabled !== 'boolean' ||
        !Number.isInteger(p.response_hours) || p.response_hours < 1 || p.response_hours > 8760)) {
    return res.status(400).json({ error: 'Supply all four severities with enabled true/false and a whole response time of 1–8760 hours.' });
  }
  db.transaction(() => {
    const put = db.prepare(`INSERT INTO sla_policies(severity,response_hours,enabled,updated_by) VALUES (?,?,?,?)
      ON CONFLICT(severity) DO UPDATE SET response_hours=excluded.response_hours,enabled=excluded.enabled,
      updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`);
    for (const p of policies) put.run(p.severity, p.response_hours, Number(p.enabled), req.user.id);
    db.prepare('INSERT INTO sla_policy_history(actor_id,policies) VALUES (?,?)').run(req.user.id, JSON.stringify(policies));
  })();
  res.json(db.prepare('SELECT * FROM sla_policies ORDER BY response_hours').all());
});
router.post('/cases/:id/sla', (req, res) => {
  const incident = db.prepare('SELECT * FROM cases WHERE id=?').get(req.params.id);
  if (!incident) return res.status(404).json({ error: 'Case not found' });
  if (incident.archived || ['Completed', 'Rejected'].includes(incident.status)) return res.status(409).json({ error: 'SLA policies can only be applied to active cases' });
  if (!db.transaction(() => applyPolicy(incident.id, req.user.id))()) return res.status(409).json({ error: 'No enabled SLA policy for this severity' });
  res.json(db.prepare('SELECT * FROM cases WHERE id=?').get(incident.id));
});
module.exports = router;

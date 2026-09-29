const router = require('express').Router();
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { SEVERITIES, applyPolicy } = require('../services/sla');
router.use(requireAuth, requireRole('SOC_ADMIN'));
router.get('/sla', (req, res) => res.json(db.prepare('SELECT * FROM sla_policies ORDER BY response_hours').all()));
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

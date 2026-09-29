const db = require('../db');
const SEVERITIES = ['Critical', 'High', 'Medium', 'Low'];
function policyDeadline(severity, createdAt) {
  const policy = db.prepare('SELECT * FROM sla_policies WHERE severity=? AND enabled=1').get(severity);
  if (!policy) return null;
  const start = Date.parse(createdAt.endsWith('Z') || /[+-]\d\d:\d\d$/.test(createdAt) ? createdAt : createdAt.replace(' ', 'T') + 'Z');
  return new Date(start + policy.response_hours * 3600000).toISOString();
}
function applyPolicy(caseId, actorId) {
  const incident = db.prepare('SELECT * FROM cases WHERE id=?').get(caseId);
  const due = policyDeadline(incident.severity, incident.created_at);
  if (!due) return false;
  if (due === incident.due_at && incident.deadline_source === 'sla') return true;
  db.prepare(`UPDATE cases SET due_at=?,deadline_source='sla',
    due_reminded_at=CASE WHEN due_at=? THEN due_reminded_at ELSE NULL END,
    due_escalated_at=CASE WHEN due_at=? THEN due_escalated_at ELSE NULL END,
    updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(due, due, due, caseId);
  db.prepare('INSERT INTO case_history(case_id,actor_id,action,detail) VALUES (?,?,?,?)')
    .run(caseId, actorId, 'deadline_changed', `${incident.severity} SLA deadline set to ${due} from case creation time`);
  return true;
}
module.exports = { SEVERITIES, policyDeadline, applyPolicy };

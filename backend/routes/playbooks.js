const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const router = express.Router();
router.use(requireAuth);
const hydrate = row => ({ ...row, steps: JSON.parse(row.steps) });
function history(caseId, actor, action, detail) {
  db.prepare('INSERT INTO case_history (case_id,actor_id,action,detail) VALUES (?,?,?,?)').run(caseId, actor, action, detail);
}
function templateInput(body = {}) {
  const { name, description = '', steps, active = true } = body;
  if (typeof name !== 'string' || !name.trim() || name.length > 120 ||
      typeof description !== 'string' || description.length > 2000 || typeof active !== 'boolean' ||
      !Array.isArray(steps) || steps.length < 1 || steps.length > 50 ||
      steps.some(step => typeof step !== 'string' || !step.trim() || step.length > 500)) return null;
  return { name: name.trim(), description: description.trim(), steps: steps.map(step => step.trim()), active: Number(active) };
}
router.get('/playbooks', (req, res) => {
  const where = req.user.role === 'SOC_ADMIN' ? '' : 'WHERE active=1';
  res.json(db.prepare(`SELECT * FROM playbook_templates ${where} ORDER BY name,id`).all().map(hydrate));
});
router.post('/playbooks', requireRole('SOC_ADMIN'), (req, res) => {
  const value = templateInput(req.body);
  if (!value) return res.status(400).json({ error: 'Provide a name (1–120 characters), description (up to 2000), and 1–50 nonempty steps (up to 500 each).' });
  const result = db.prepare('INSERT INTO playbook_templates (name,description,steps,active,created_by) VALUES (?,?,?,?,?)')
    .run(value.name, value.description, JSON.stringify(value.steps), value.active, req.user.id);
  res.status(201).json(hydrate(db.prepare('SELECT * FROM playbook_templates WHERE id=?').get(result.lastInsertRowid)));
});
router.put('/playbooks/:id', requireRole('SOC_ADMIN'), (req, res) => {
  if (!db.prepare('SELECT id FROM playbook_templates WHERE id=?').get(req.params.id)) return res.status(404).json({ error: 'Playbook not found' });
  const value = templateInput(req.body);
  if (!value) return res.status(400).json({ error: 'Invalid playbook: a name and 1–50 nonempty steps are required.' });
  db.prepare('UPDATE playbook_templates SET name=?,description=?,steps=?,active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')
    .run(value.name, value.description, JSON.stringify(value.steps), value.active, req.params.id);
  res.json(hydrate(db.prepare('SELECT * FROM playbook_templates WHERE id=?').get(req.params.id)));
});
function caseExists(req, res, next) {
  const incident = db.prepare('SELECT * FROM cases WHERE id=?').get(req.params.caseId);
  if (!incident) return res.status(404).json({ error: 'Case not found' });
  if (req.method !== 'GET' && (incident.archived || ['Completed', 'Rejected'].includes(incident.status))) {
    return res.status(409).json({ error: 'Playbooks are read-only on completed, rejected or archived cases.' });
  }
  req.incident = incident;
  next();
}
function casePlaybooks(caseId) {
  return db.prepare('SELECT p.*,u.username AS attached_by_username FROM case_playbooks p LEFT JOIN users u ON u.id=p.attached_by WHERE p.case_id=? ORDER BY p.id').all(caseId).map(playbook => ({
    ...playbook,
    tasks: db.prepare(`SELECT t.*,a.username AS assignee,c.username AS completed_by_username
      FROM playbook_tasks t LEFT JOIN users a ON a.id=t.assigned_to LEFT JOIN users c ON c.id=t.completed_by
      WHERE t.case_playbook_id=? ORDER BY t.position,t.id`).all(playbook.id),
  }));
}
router.get('/cases/:caseId/playbooks', caseExists, (req, res) => res.json(casePlaybooks(req.params.caseId)));
router.post('/cases/:caseId/playbooks', caseExists, (req, res) => {
  const templateId = req.body?.templateId;
  if (!Number.isSafeInteger(templateId) || templateId < 1) return res.status(400).json({ error: 'Choose a valid playbook template' });
  const template = db.prepare('SELECT * FROM playbook_templates WHERE id=? AND active=1').get(templateId);
  if (!template) return res.status(404).json({ error: 'Active playbook template not found' });
  if (db.prepare('SELECT id FROM case_playbooks WHERE case_id=? AND template_id=?').get(req.params.caseId, templateId)) return res.status(409).json({ error: 'This playbook is already attached' });
  db.transaction(() => {
    const result = db.prepare('INSERT INTO case_playbooks (case_id,template_id,name,description,attached_by) VALUES (?,?,?,?,?)')
      .run(req.params.caseId, templateId, template.name, template.description, req.user.id);
    const insert = db.prepare('INSERT INTO playbook_tasks (case_playbook_id,position,title) VALUES (?,?,?)');
    JSON.parse(template.steps).forEach((step, position) => insert.run(result.lastInsertRowid, position, step));
    history(req.params.caseId, req.user.id, 'playbook_attached', `Attached playbook "${template.name}"`);
  })();
  res.status(201).json(casePlaybooks(req.params.caseId));
});
router.patch('/cases/:caseId/playbooks/tasks/:taskId', caseExists, (req, res) => {
  const task = db.prepare(`SELECT t.*,p.name FROM playbook_tasks t JOIN case_playbooks p ON p.id=t.case_playbook_id
    WHERE t.id=? AND p.case_id=?`).get(req.params.taskId, req.params.caseId);
  if (!task) return res.status(404).json({ error: 'Task not found in this case' });
  const { completed, assigned_to } = req.body || {};
  if (completed === undefined && assigned_to === undefined) return res.status(400).json({ error: 'Choose completion or assignment to update' });
  if (completed !== undefined && typeof completed !== 'boolean') return res.status(400).json({ error: 'completed must be a boolean' });
  let assignee;
  if (assigned_to !== undefined) {
    if (req.user.role !== 'SOC_ADMIN') return res.status(403).json({ error: 'Only SOC Admin can assign playbook tasks' });
    if (assigned_to !== null) {
      if (!Number.isSafeInteger(assigned_to) || assigned_to < 1) return res.status(400).json({ error: 'Choose an active user or unassign the task' });
      assignee = db.prepare('SELECT * FROM users WHERE id=? AND active=1').get(assigned_to);
      if (!assignee) return res.status(400).json({ error: 'Assignee must be an active user' });
    }
  }
  db.transaction(() => {
    if (assigned_to !== undefined && assigned_to !== task.assigned_to) {
      db.prepare('UPDATE playbook_tasks SET assigned_to=? WHERE id=?').run(assigned_to, task.id);
      history(req.params.caseId, req.user.id, 'playbook_task_assigned', `${task.name}: "${task.title}" ${assignee ? `assigned to ${assignee.username}` : 'unassigned'}`);
    }
    if (completed !== undefined && completed !== Boolean(task.completed_at)) {
      db.prepare('UPDATE playbook_tasks SET completed_at=?,completed_by=? WHERE id=?')
        .run(completed ? new Date().toISOString() : null, completed ? req.user.id : null, task.id);
      history(req.params.caseId, req.user.id, completed ? 'playbook_task_completed' : 'playbook_task_reopened', `${task.name}: "${task.title}"`);
    }
  })();
  res.json(casePlaybooks(req.params.caseId));
});
module.exports = router;

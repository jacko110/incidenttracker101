const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
process.env.DATABASE_PATH = ':memory:';
process.env.JWT_SECRET = 'isolated-playbook-test-secret-not-for-production';
process.env.SMTP_HOST = '';
const db = require('../db');
const express = require('express');
const jwt = require('jsonwebtoken');
const tokens = {};
let server, base;
before(async () => {
  for (const [name, role] of [['admin', 'SOC_ADMIN'], ['analyst', 'SOC_ANALYST'], ['ir', 'IR_ANALYST']]) {
    const id = db.prepare('INSERT INTO users(username,password_hash,role) VALUES (?,?,?)').run(name, 'unused', role).lastInsertRowid;
    tokens[name] = jwt.sign({ id }, process.env.JWT_SECRET);
  }
  db.prepare('INSERT INTO users(username,password_hash,active) VALUES (?,?,0)').run('inactive', 'unused');
  const app = express();
  app.use(express.json());
  app.use('/api', require('../routes/playbooks'));
  await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(async () => { await new Promise(resolve => server.close(resolve)); db.close(); });
async function request(route, { role = 'admin', method = 'GET', body, status = 200 } = {}) {
  const response = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', ...(role ? { Authorization: `Bearer ${tokens[role]}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  assert.equal(response.status, status, `${method} ${route}: ${text}`);
  return JSON.parse(text);
}
const template = () => request('/playbooks', { method: 'POST', body: { name: 'Phishing', steps: ['Preserve evidence', 'Document findings'] }, status: 201 });
const incident = () => db.prepare("INSERT INTO cases(title) VALUES ('Playbook test')").run().lastInsertRowid;
const attach = (id, templateId, status = 201) => request(`/cases/${id}/playbooks`, { role: 'analyst', method: 'POST', body: { templateId }, status });
const update = (id, taskId, body, role = 'admin', status = 200) => request(`/cases/${id}/playbooks/tasks/${taskId}`, { method: 'PATCH', body, role, status });

test('only admins manage templates and invalid templates are rejected', async () => {
  await request('/playbooks', { role: null, status: 401 });
  for (const role of ['analyst', 'ir']) await request('/playbooks', { role, method: 'POST', body: { name: 'Denied', steps: ['Step'] }, status: 403 });
  for (const body of [{}, { name: ' ', steps: ['Step'] }, { name: 'Invalid', steps: [] }, { name: 'Invalid', steps: [null] }, { name: 'Invalid', steps: Array(51).fill('Step') }]) {
    await request('/playbooks', { method: 'POST', body, status: 400 });
  }
  const saved = await template();
  await request(`/playbooks/${saved.id}`, { role: 'analyst', method: 'PUT', body: { name: 'Change', steps: ['Step'] }, status: 403 });
});
test('attached checklists snapshot templates, prevent duplicates and reject missing cases', async () => {
  const saved = await template(), id = incident();
  const attached = await attach(id, saved.id);
  assert.deepEqual(attached[0].tasks.map(task => task.title), saved.steps);
  await attach(id, saved.id, 409);
  await attach(999999, saved.id, 404);
  await request(`/playbooks/${saved.id}`, { method: 'PUT', body: { name: 'Updated template', steps: ['New step'], active: false } });
  const snapshots = await request(`/cases/${id}/playbooks`, { role: 'analyst' });
  assert.equal(snapshots[0].name, 'Phishing');
  assert.deepEqual(snapshots[0].tasks.map(task => task.title), saved.steps);
  assert.equal((await request('/playbooks', { role: 'analyst' })).some(row => row.id === saved.id), false);
  await attach(incident(), saved.id, 404);
});
test('task assignment enforces admin role, active owners and case boundaries', async () => {
  const saved = await template(), id = incident();
  const task = (await attach(id, saved.id))[0].tasks[0];
  await update(id, task.id, { assigned_to: 2 }, 'analyst', 403);
  await update(id, task.id, { assigned_to: 4 }, 'admin', 400);
  await update(id, task.id, { assigned_to: 9999 }, 'admin', 400);
  await update(id, task.id, { assigned_to: '2' }, 'admin', 400);
  await update(incident(), task.id, { completed: true }, 'admin', 404);
  const assigned = await update(id, task.id, { assigned_to: 2 });
  assert.equal(assigned[0].tasks[0].assignee, 'analyst');
  const cleared = await update(id, task.id, { assigned_to: null });
  assert.equal(cleared[0].tasks[0].assigned_to, null);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM case_history WHERE case_id=? AND action='playbook_task_assigned'").get(id).n, 2);
});
test('completion records actor and time, repeated requests do not duplicate history, reopening preserves the audit', async () => {
  const saved = await template(), id = incident();
  const task = (await attach(id, saved.id))[0].tasks[0];
  await update(id, task.id, { completed: 'true' }, 'analyst', 400);
  let result = await update(id, task.id, { completed: true }, 'analyst');
  const timestamp = result[0].tasks[0].completed_at;
  assert.ok(timestamp);
  assert.equal(result[0].tasks[0].completed_by_username, 'analyst');
  result = await update(id, task.id, { completed: true }, 'ir');
  assert.equal(result[0].tasks[0].completed_at, timestamp);
  assert.equal(result[0].tasks[0].completed_by_username, 'analyst');
  result = await update(id, task.id, { completed: false }, 'ir');
  assert.equal(result[0].tasks[0].completed_at, null);
  assert.equal(result[0].tasks[0].completed_by, null);
  const history = db.prepare('SELECT action,actor_id FROM case_history WHERE case_id=? ORDER BY id').all(id);
  assert.deepEqual(history.map(row => row.action), ['playbook_attached', 'playbook_task_completed', 'playbook_task_reopened']);
  assert.deepEqual(history.map(row => row.actor_id), [2, 2, 3]);
});
test('closed and archived cases retain readable checklists but reject mutation', async () => {
  for (const state of ['Completed', 'Rejected', 'archived']) {
    const saved = await template(), id = incident();
    const task = (await attach(id, saved.id))[0].tasks[0];
    if (state === 'archived') db.prepare('UPDATE cases SET archived=1 WHERE id=?').run(id);
    else db.prepare('UPDATE cases SET status=? WHERE id=?').run(state, id);
    await update(id, task.id, { completed: true }, 'admin', 409);
    await attach(id, saved.id, 409);
    assert.equal((await request(`/cases/${id}/playbooks`))[0].tasks[0].completed_at, null);
  }
});
test('attachment and completion roll back when audit writing fails', async () => {
  const saved = await template(), id = incident();
  const task = (await attach(id, saved.id))[0].tasks[0];
  db.exec("CREATE TRIGGER fail_playbook_history BEFORE INSERT ON case_history BEGIN SELECT RAISE(ABORT, 'test audit failure'); END");
  try {
    for (const [route, method, body] of [
      [`/cases/${id}/playbooks/tasks/${task.id}`, 'PATCH', { completed: true }],
      [`/cases/${incident()}/playbooks`, 'POST', { templateId: saved.id }],
    ]) {
      const response = await fetch(base + route, { method, headers: { Authorization: `Bearer ${tokens.admin}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      assert.equal(response.status, 500);
      await response.text();
    }
    assert.equal(db.prepare('SELECT completed_at FROM playbook_tasks WHERE id=?').get(task.id).completed_at, null);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM case_playbooks WHERE template_id=?').get(saved.id).n, 1);
  } finally { db.exec('DROP TRIGGER fail_playbook_history'); }
});

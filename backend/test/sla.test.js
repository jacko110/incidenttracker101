const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
process.env.DATABASE_PATH = ':memory:';
process.env.JWT_SECRET = 'isolated-sla-policy-test-secret-not-for-production';
process.env.SMTP_HOST = '';
const db = require('../db');
const express = require('express');
const jwt = require('jsonwebtoken');
let server, base;
const tokens = {};
const policies = (hours = 4, enabled = true) => ['Critical', 'High', 'Medium', 'Low'].map(severity => ({ severity, response_hours: hours, enabled }));
before(async () => {
  for (const [name, role] of [['admin', 'SOC_ADMIN'], ['analyst', 'SOC_ANALYST']]) {
    const id = db.prepare('INSERT INTO users(username,password_hash,role) VALUES (?,?,?)').run(name, 'unused', role).lastInsertRowid;
    tokens[name] = jwt.sign({ id }, process.env.JWT_SECRET);
  }
  const app = express(); app.use(express.json());
  app.use('/api/cases', require('../routes/cases')); app.use('/api', require('../routes/sla'));
  await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}/api`;
});
beforeEach(() => { db.prepare('DELETE FROM sla_policies').run(); db.prepare('DELETE FROM sla_policy_history').run(); });
after(async () => { await new Promise(resolve => server.close(resolve)); db.close(); });
async function request(route, method = 'GET', body, role = 'admin', status = 200) {
  const res = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens[role]}` }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text(); assert.equal(res.status, status, text); return JSON.parse(text);
}
const create = (severity = 'High') => request('/cases', 'POST', { title: 'SLA incident', severity }, 'analyst', 201);
const save = (rows = policies()) => request('/sla', 'PUT', { policies: rows });
const epoch = value => Date.parse(value.replace(' ', 'T') + 'Z');
test('SLA policies start disabled and only admins can view or change them', async () => {
  assert.deepEqual(await request('/sla'), []);
  assert.equal((await create()).due_at, null);
  await request('/sla', 'GET', undefined, 'analyst', 403);
  await request('/sla', 'PUT', { policies: policies() }, 'analyst', 403);
  await save();
  assert.equal(db.prepare('SELECT actor_id FROM sla_policy_history').get().actor_id, 1);
});
test('invalid and duplicate policies are rejected without partial changes', async () => {
  await save();
  for (const rows of [[], policies().slice(1), policies().map(() => policies()[0]), policies(-1), policies(0.5), policies(8761), policies().map(p => ({ ...p, enabled: 1 }))]) {
    await request('/sla', 'PUT', { policies: rows }, 'admin', 400);
  }
  assert.equal((await request('/sla')).length, 4);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM sla_policy_history').get().n, 1);
});
test('each enabled severity receives an audited UTC deadline from original creation time', async () => {
  await save(policies().map((row, index) => ({ ...row, response_hours: index + 1 })));
  for (const [index, severity] of ['Critical', 'High', 'Medium', 'Low'].entries()) {
    const incident = await create(severity);
    assert.equal(Date.parse(incident.due_at) - epoch(incident.created_at), (index + 1) * 3600000);
    assert.equal(incident.deadline_source, 'sla');
    const detail = await request(`/cases/${incident.id}`);
    assert.ok(detail.history.some(row => row.action === 'deadline_changed' && row.detail.includes('SLA')));
  }
  assert.equal((await create('N/A')).due_at, null);
  await save(policies(4, false)); assert.equal((await create()).due_at, null);
});
test('policy edits and severity edits preserve deadlines and manual clearing is respected', async () => {
  await save(); const incident = await create();
  await save(policies(8));
  let current = await request(`/cases/${incident.id}`);
  assert.equal(current.due_at, incident.due_at);
  current = await request(`/cases/${incident.id}`, 'PATCH', { severity: 'Low' }, 'analyst');
  assert.equal(current.due_at, incident.due_at);
  await request(`/cases/${incident.id}`, 'PATCH', { due_at: null }, 'analyst', 403);
  db.prepare("UPDATE cases SET due_escalated_at='sent' WHERE id=?").run(incident.id);
  current = await request(`/cases/${incident.id}`, 'PATCH', { due_at: incident.due_at });
  assert.equal(current.due_escalated_at, 'sent');
  current = await request(`/cases/${incident.id}`, 'PATCH', { due_at: null });
  assert.equal(current.due_escalated_at, null);
  assert.equal(current.deadline_source, 'manual'); assert.equal(current.due_at, null);
  await save(policies(2));
  assert.equal((await request(`/cases/${incident.id}`)).due_at, null);
});
test('explicit application uses original time, resets changed reminders and is idempotent', async () => {
  await save(); const incident = await create();
  await request(`/cases/${incident.id}/sla`, 'POST', {}, 'analyst', 403);
  db.prepare("UPDATE cases SET created_at='2020-01-01 00:00:00',due_reminded_at='already sent' WHERE id=?").run(incident.id);
  const current = await request(`/cases/${incident.id}/sla`, 'POST', {});
  assert.equal(current.due_at, '2020-01-01T04:00:00.000Z'); assert.equal(current.due_reminded_at, null);
  db.prepare("UPDATE cases SET due_reminded_at='sent' WHERE id=?").run(incident.id);
  assert.equal((await request(`/cases/${incident.id}/sla`, 'POST', {})).due_reminded_at, 'sent');
  assert.equal((await request('/cases?due=overdue')).data.some(row => row.id === incident.id), true);
  await save(policies(4, false));
  await request(`/cases/${incident.id}/sla`, 'POST', {}, 'admin', 409);
  assert.equal((await request(`/cases/${incident.id}`)).due_at, current.due_at);
});
test('closed cases reject SLA application and policy writes roll back on audit failure', async () => {
  await save();
  for (const status of ['Completed', 'Rejected']) {
    const incident = await create(); db.prepare('UPDATE cases SET status=? WHERE id=?').run(status, incident.id);
    await request(`/cases/${incident.id}/sla`, 'POST', {}, 'admin', 409);
  }
  const incident = await create(); db.prepare('UPDATE cases SET archived=1 WHERE id=?').run(incident.id);
  await request(`/cases/${incident.id}/sla`, 'POST', {}, 'admin', 409);
  db.exec("CREATE TRIGGER fail_sla_audit BEFORE INSERT ON sla_policy_history BEGIN SELECT RAISE(ABORT,'test policy audit failure'); END");
  try {
    const res = await fetch(base + '/sla', { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens.admin}` }, body: JSON.stringify({ policies: policies(9) }) });
    assert.equal(res.status, 500); await res.text();
    assert.ok((await request('/sla')).every(row => row.response_hours === 4));
  } finally { db.exec('DROP TRIGGER fail_sla_audit'); }
});

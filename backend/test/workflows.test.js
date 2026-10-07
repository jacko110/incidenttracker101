const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
process.env.DATABASE_PATH = ':memory:';
process.env.JWT_SECRET = 'isolated-workflow-test-secret-never-use-in-production';
process.env.SMTP_HOST = ''; // Never send real mail, even with inherited credentials.
process.env.UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'nib-workflows-'));
const db = require('../db');
const express = require('express');
const bcrypt = require('bcryptjs');
const { sendDueReminders } = require('../services/deadlines');
let server, base;
const tokens = {}, ids = {};
const password = 'workflow-test-password';
async function request(route, { role = 'analyst', method = 'GET', body, status = 200 } = {}) {
  const response = await fetch(base + route, {
    method, headers: { 'Content-Type': 'application/json', ...(role ? { Authorization: `Bearer ${tokens[role]}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  assert.equal(response.status, status, `${method} ${route}: ${text}`);
  return JSON.parse(text);
}
const create = (body = {}) => request('/cases', { method: 'POST', status: 201, body: { title: 'Workflow incident', ...body } });
const patch = (id, body, role = 'admin', status = 200) => request(`/cases/${id}`, { role, method: 'PATCH', body, status });
const due = hours => new Date(Date.now() + hours * 3600000).toISOString();
const detail = id => request(`/cases/${id}`);
async function waitForEmails(count) {
  for (let i = 0; i < 100; i++) {
    if (db.prepare('SELECT COUNT(*) n FROM email_log').get().n >= count) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail(`Expected ${count} email log entries`);
}
before(async () => {
  const app = express();
  app.use(express.json());
  for (const route of ['auth', 'cases', 'notifications', 'iocs', 'uploads', 'chat', 'users']) app.use('/' + route, require('../routes/' + route));
  await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
  for (const [name, role] of [['admin', 'SOC_ADMIN'], ['analyst', 'SOC_ANALYST'], ['ir', 'IR_ANALYST']]) {
    ids[name] = db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)').run(name, bcrypt.hashSync(password, 4), role).lastInsertRowid;
    tokens[name] = (await request('/auth/login', { role: null, method: 'POST', body: { username: name, password } })).token;
  }
});
beforeEach(() => {
  for (const table of ['case_links', 'case_notes', 'case_history', 'iocs', 'notifications', 'email_log', 'chat_messages', 'cases']) db.prepare(`DELETE FROM ${table}`).run();
  db.prepare('UPDATE users SET active = 1, email = NULL, email_notifications = 1').run();
});
after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  db.close();
  fs.rmSync(process.env.UPLOAD_DIR, { recursive: true, force: true });
});
test('login and authentication protect every workflow', async () => {
  for (const route of ['/cases', '/iocs', '/notifications', '/chat', '/users']) await request(route, { role: null, status: 401 });
  await request('/auth/login', { role: null, method: 'POST', body: { username: 'analyst', password: 'incorrect' }, status: 401 });
  assert.equal((await request('/auth/me')).user.id, ids.analyst);
});
test('incident intake persists fields, searchable IOCs, edits, notes and actor history', async () => {
  const payload = { title: 'Unique phishing investigation', severity: 'High', attack_type: 'Phishing', origin_country: 'Ethiopia', source_ip: ['192.0.2.1'], destination_ip: ['192.0.2.2'], incident_datetime: '2026-01-02T12:00', asset_name: 'Mail gateway', shift: 'Day', http_status: ['403'], summary: 'Summary', impact: 'Impact', recommendations: 'Block domain', iocs: [{ type: 'Domain', value: 'example.invalid', threatIntelligence: 'Internal', count: 2, percentage: 50, description: 'Phishing domain' }] };
  const incident = await create(payload), saved = await detail(incident.id);
  for (const [key, value] of Object.entries(payload)) assert.deepEqual(saved[key], value, key);
  assert.equal(saved.assignee.id, ids.analyst);
  assert.equal(saved.iocRecords[0].value, 'example.invalid');
  assert.equal(saved.history[0].actor_id, ids.analyst);
  const search = await request('/iocs?q=example.invalid&type=Domain&pageSize=1');
  assert.equal(search.pagination.total, 1);
  assert.equal(search.data[0].case_id, incident.id);
  await request(`/cases/${incident.id}`, { method: 'PUT', body: { summary: 'Updated summary', source_ip: ['192.0.2.3'] } });
  await request(`/cases/${incident.id}/notes`, { method: 'POST', body: { body: 'Investigated the gateway' }, status: 201 });
  await patch(incident.id, { status: 'In Progress' }, 'analyst');
  const updated = await detail(incident.id);
  assert.equal(updated.summary, 'Updated summary');
  assert.deepEqual(updated.source_ip, ['192.0.2.3']);
  assert.equal(updated.notes[0].body, 'Investigated the gateway');
  assert.equal(updated.notes[0].author_id, ids.analyst);
  assert.deepEqual(new Set(updated.history.map(h => h.action)), new Set(['created', 'edited', 'status_changed']));
});
test('invalid intake and missing-case notes fail without writing records', async () => {
  for (const body of [{}, { title: '   ' }, { title: 'Bad IOC', iocs: [null] }, { title: 'Bad IOC type', iocs: [{ type: {} }] }, { title: 'Bad IOC list', iocs: {} }]) await request('/cases', { method: 'POST', body, status: 400 });
  assert.equal(db.prepare('SELECT COUNT(*) n FROM cases').get().n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM iocs').get().n, 0);
  await request('/cases/999999/notes', { method: 'POST', body: { body: 'Missing case' }, status: 404 });
  assert.equal(db.prepare('SELECT COUNT(*) n FROM case_notes').get().n, 0);
});
test('assignment enforces roles and active users; notifications stay private', async () => {
  const incident = await create();
  for (const role of ['analyst', 'ir']) await request(`/cases/${incident.id}/assign`, { role, method: 'POST', body: { userId: ids.ir }, status: 403 });
  db.prepare('UPDATE users SET active = 0 WHERE id = ?').run(ids.ir);
  assert.equal((await request('/cases/lookup/users')).some(u => u.id === ids.ir), false);
  await request(`/cases/${incident.id}/assign`, { role: 'admin', method: 'POST', body: { userId: ids.ir }, status: 400 });
  assert.equal((await detail(incident.id)).assigned_to, ids.analyst);
  db.prepare('UPDATE users SET active = 1 WHERE id = ?').run(ids.ir);
  await request(`/cases/${incident.id}/assign`, { role: 'admin', method: 'POST', body: { userId: ids.ir } });
  assert.equal((await request('/cases?assignedToMe=1')).pagination.total, 0);
  assert.equal((await request('/cases?assignedToMe=1', { role: 'ir' })).data[0].id, incident.id);
  const inbox = await request('/notifications', { role: 'ir' });
  assert.equal(inbox.unread, 1);
  assert.equal((await request('/notifications')).unread, 0);
  await request(`/notifications/${inbox.notifications[0].id}/read`, { method: 'POST' });
  assert.equal((await request('/notifications', { role: 'ir' })).unread, 1);
  await request('/notifications/read-all', { role: 'ir', method: 'POST' });
  assert.equal((await request('/notifications', { role: 'ir' })).unread, 0);
});
test('rejection labels cannot be forged; archive and restore enforce roles', async () => {
  const incident = await create();
  await request(`/cases/${incident.id}/reject`, { method: 'POST', body: {}, status: 403 });
  await patch(incident.id, { status: 'Rejected' }, 'admin', 400);
  const rejected = await request(`/cases/${incident.id}/reject`, { role: 'ir', method: 'POST', body: { rejected_by: 'SOC Admin', reason: 'False positive' } });
  assert.equal(rejected.rejected_by, 'IR Analyst');
  assert.equal((await request('/notifications')).unread, 1);
  assert.ok((await detail(incident.id)).history.some(h => h.action === 'rejected' && h.detail.includes('False positive')));
  for (const role of ['analyst', 'ir']) await patch(incident.id, { archived: true }, role, 403);
  await patch(incident.id, { archived: true });
  assert.equal((await request('/cases')).pagination.total, 0);
  assert.equal((await request('/cases?archived=1')).data[0].id, incident.id);
  await patch(incident.id, { archived: false });
  assert.equal((await request('/cases')).data[0].id, incident.id);
});
test('case search, pagination, status filters and dashboard date bounds agree', async () => {
  for (let i = 0; i < 4; i++) await create({ title: `Search needle ${i}` });
  await create({ title: 'Unrelated' });
  const first = await request('/cases?q=needle&pageSize=2&page=1'), second = await request('/cases?q=needle&pageSize=2&page=2');
  assert.equal(first.pagination.total, 4);
  assert.equal(new Set([...first.data, ...second.data].map(c => c.id)).size, 4);
  await patch(first.data[0].id, { status: 'Completed' });
  assert.equal((await request('/cases?status=Completed')).pagination.total, 1);
  db.prepare("UPDATE cases SET created_at = '2020-01-01 00:00:00' WHERE id = ?").run(first.data[0].id);
  const stats = await request('/cases/stats?from=2020-01-01&to=2020-01-01');
  assert.equal(stats.total, 1);
  assert.equal(stats.byStatus.Completed, 1);
});
test('deadline permissions, timezone normalization, clearing and invalid inputs', async () => {
  const incident = await create();
  for (const role of ['analyst', 'ir']) await patch(incident.id, { due_at: due(12) }, role, 403);
  for (const value of ['not-a-date', '2026-10-01T12:00:00', 42]) await patch(incident.id, { due_at: value }, 'admin', 400);
  const saved = await patch(incident.id, { due_at: '2026-10-01T15:00:00+03:00' });
  assert.equal(saved.due_at, '2026-10-01T12:00:00.000Z');
  await patch(incident.id, { due_at: null }, 'analyst', 403);
  assert.equal((await detail(incident.id)).due_at, saved.due_at);
  assert.equal((await patch(incident.id, { due_at: null })).due_at, null);
  assert.equal((await detail(incident.id)).history.filter(h => h.action === 'deadline_changed').length, 2);
});
test('deadline workload excludes completed, rejected and archived cases and sorts nearest first', async () => {
  const expected = { overdue: [], upcoming: [] };
  for (const hours of [-4, -2, 2, 4, 48]) {
    const incident = await create();
    await patch(incident.id, { due_at: due(hours) });
    if (hours < 0) expected.overdue.push(incident.id);
    else if (hours < 24) expected.upcoming.push(incident.id);
  }
  for (const state of ['Completed', 'Rejected', 'archived']) {
    const incident = await create();
    await patch(incident.id, { due_at: due(-1) });
    if (state === 'Rejected') await request(`/cases/${incident.id}/reject`, { role: 'admin', method: 'POST', body: {} });
    else await patch(incident.id, state === 'archived' ? { archived: true } : { status: state });
  }
  const stats = (await request('/cases/stats')).deadlines;
  for (const kind of ['overdue', 'upcoming']) {
    assert.deepEqual((await request(`/cases?due=${kind}`)).data.map(c => c.id), expected[kind]);
    assert.equal(stats[kind], 2);
    assert.deepEqual(stats[kind + 'Cases'].map(c => c.id), expected[kind]);
  }
});
test('reminders deduplicate, catch overdue cases, reset on deadline changes and honor email opt-out', async () => {
  db.prepare('UPDATE users SET email = ? WHERE id = ?').run('analyst@example.invalid', ids.analyst);
  const incident = await create(), firstDue = due(12);
  await patch(incident.id, { due_at: firstDue });
  assert.equal(sendDueReminders(), 1);
  assert.equal(sendDueReminders(), 0);
  await waitForEmails(1);
  assert.equal((await request('/notifications')).unread, 1);
  assert.match(db.prepare('SELECT status FROM email_log').get().status, /no SMTP/);
  await patch(incident.id, { due_at: firstDue });
  assert.equal(sendDueReminders(), 0);
  await request('/auth/me', { method: 'PATCH', body: { email_notifications: false } });
  await patch(incident.id, { due_at: due(-1) });
  assert.equal(sendDueReminders(), 1);
  assert.equal(sendDueReminders(), 0);
  const inbox = await request('/notifications');
  assert.equal(inbox.unread, 2);
  assert.ok(inbox.notifications.some(n => n.message.includes('overdue')));
  assert.equal(db.prepare('SELECT COUNT(*) n FROM email_log').get().n, 1);
  await patch(incident.id, { due_at: null });
  assert.equal(sendDueReminders(), 0);
});
test('reminders skip closed, archived, distant, unassigned and inactive-user cases', async () => {
  for (const state of ['Completed', 'Rejected', 'archived', 'distant', 'unassigned', 'inactive']) {
    const incident = await create();
    await patch(incident.id, { due_at: due(state === 'distant' ? 48 : 12) });
    if (state === 'Completed') await patch(incident.id, { status: state });
    if (state === 'Rejected') await request(`/cases/${incident.id}/reject`, { role: 'admin', method: 'POST', body: {} });
    if (state === 'archived') await patch(incident.id, { archived: true });
    if (state === 'unassigned') await request(`/cases/${incident.id}/assign`, { role: 'admin', method: 'POST', body: { userId: null } });
    if (state === 'inactive') {
      await request(`/cases/${incident.id}/assign`, { role: 'admin', method: 'POST', body: { userId: ids.ir } });
      db.prepare('UPDATE users SET active = 0 WHERE id = ?').run(ids.ir);
    }
  }
  const count = db.prepare('SELECT COUNT(*) n FROM notifications').get().n;
  assert.equal(sendDueReminders(), 0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM notifications').get().n, count);
});
test('case links are bidirectional and reject duplicates, self-links and unrelated deletion', async () => {
  const a = await create(), b = await create(), c = await create();
  await request(`/cases/${a.id}/links`, { method: 'POST', body: { targetCaseId: a.id }, status: 400 });
  const linked = await request(`/cases/${a.id}/links`, { method: 'POST', body: { targetCaseId: b.id, note: 'Same campaign' }, status: 201 });
  const linkId = linked.linkedCases[0].link_id;
  assert.equal((await detail(b.id)).linkedCases[0].case_id, a.id);
  await request(`/cases/${b.id}/links`, { method: 'POST', body: { targetCaseId: a.id }, status: 409 });
  await request(`/cases/${c.id}/links/${linkId}`, { method: 'DELETE', status: 400 });
  await request(`/cases/${b.id}/links/${linkId}`, { method: 'DELETE' });
  assert.equal((await detail(a.id)).linkedCases.length, 0);
});
test('multipart attachments round-trip and reject missing, invalid and deactivated credentials', async () => {
  const form = new FormData();
  form.append('files', new Blob(['workflow attachment']), 'evidence.txt');
  const response = await fetch(base + '/uploads', { method: 'POST', headers: { Authorization: `Bearer ${tokens.analyst}` }, body: form });
  assert.equal(response.status, 201);
  const file = (await response.json()).files[0], route = file.url.replace(/^\/api/, '');
  assert.equal((await fetch(base + route)).status, 401);
  assert.equal((await fetch(base + route + '?token=invalid')).status, 401);
  const download = await fetch(base + route, { headers: { Authorization: `Bearer ${tokens.analyst}` } });
  assert.equal(download.status, 200);
  assert.equal(await download.text(), 'workflow attachment');
  // A token-bearing link IS a credential, including in a fresh browser context.
  assert.equal((await fetch(base + route + '?token=' + tokens.analyst)).status, 200);
  const incident = await create({ iocs: [{ type: 'File Hash', value: 'test-hash', documents: [file] }] });
  assert.deepEqual((await detail(incident.id)).iocRecords[0].documents, [file]);
  assert.equal((await fetch(base + '/uploads/file/..%5Cprivate?token=' + tokens.analyst)).status, 400);
  db.prepare('UPDATE users SET active = 0 WHERE id = ?').run(ids.analyst);
  assert.equal((await fetch(base + route + '?token=' + tokens.analyst)).status, 403);
});
test('uploads reject oversized files and excess counts without leaving partial files', async () => {
  const beforeFiles = fs.readdirSync(process.env.UPLOAD_DIR).sort();
  for (const mode of ['size', 'count']) {
    const form = new FormData();
    if (mode === 'size') form.append('files', new Blob([Buffer.alloc(10 * 1024 * 1024 + 1)]), 'large.txt');
    else for (let i = 0; i < 11; i++) form.append('files', new Blob(['small']), `file-${i}.txt`);
    const response = await fetch(base + '/uploads', { method: 'POST', headers: { Authorization: `Bearer ${tokens.analyst}` }, body: form });
    assert.equal(response.status, 400);
    assert.deepEqual(fs.readdirSync(process.env.UPLOAD_DIR).sort(), beforeFiles);
  }
});
test('chat persists messages with the authenticated author', async () => {
  await request('/chat', { method: 'POST', body: {}, status: 400 });
  await request('/chat', { method: 'POST', body: { body: 'Investigating now', user_id: ids.admin }, status: 201 });
  const messages = await request('/chat', { role: 'ir' });
  assert.equal(messages.length, 1);
  assert.equal(messages[0].body, 'Investigating now');
  assert.equal(messages[0].user_id, ids.analyst);
});

test('incident creation rolls back if writing the audit trail fails', async () => {
  db.exec("CREATE TRIGGER fail_history BEFORE INSERT ON case_history BEGIN SELECT RAISE(ABORT, 'test audit failure'); END");
  try {
    const response = await fetch(base + '/cases', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens.analyst}` },
      body: JSON.stringify({ title: 'Must roll back', iocs: [{ type: 'Domain', value: 'rollback.invalid' }] }),
    });
    assert.equal(response.status, 500);
    await response.text();
    for (const table of ['cases', 'iocs', 'case_history']) assert.equal(db.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n, 0);
  } finally { db.exec('DROP TRIGGER fail_history'); }
});

test('admin account management creates usable accounts, resets passwords and revokes access', async () => {
  const body = { username: 'managed-user', password, role: 'IR_ANALYST' };
  await request('/users', { method: 'POST', body, status: 403 });
  const user = await request('/users', { role: 'admin', method: 'POST', body, status: 201 });
  assert.equal(user.password_hash, undefined);
  await request('/users', { role: 'admin', method: 'POST', body, status: 409 });
  tokens.managed = (await request('/auth/login', { role: null, method: 'POST', body })).token;
  await request(`/users/${user.id}`, { role: 'admin', method: 'PATCH', body: { password: 'replacement-password', role: 'SOC_ANALYST' } });
  await request('/auth/login', { role: null, method: 'POST', body, status: 401 });
  await request('/auth/me', { role: 'managed', status: 401 });
  tokens.managed = (await request('/auth/login', { role: null, method: 'POST', body: { username: body.username, password: 'replacement-password' } })).token;
  assert.equal((await request('/auth/me', { role: 'managed' })).user.role, 'SOC_ANALYST');
  await request(`/users/${user.id}`, { role: 'admin', method: 'PATCH', body: { active: false } });
  assert.equal((await request('/auth/me', { role: 'managed', status: 403 })).code, 'ACCOUNT_DEACTIVATED');
  await request(`/users/${ids.admin}`, { role: 'admin', method: 'PATCH', body: { active: false }, status: 400 });
});

test('critical incidents notify active admins and log email without SMTP', async () => {
  db.prepare('UPDATE users SET email = ? WHERE id = ?').run('admin@example.invalid', ids.admin);
  const incident = await create({ severity: 'Critical' });
  const inbox = await request('/notifications', { role: 'admin' });
  assert.equal(inbox.unread, 1);
  assert.equal(inbox.notifications[0].case_id, incident.id);
  assert.equal((await request('/notifications')).unread, 0);
  await waitForEmails(1);
  const logs = await request('/users/email-log', { role: 'admin' });
  assert.equal(logs[0].recipient, 'admin@example.invalid');
  assert.match(logs[0].subject, /Critical incident/);
  await request('/users/email-log', { status: 403 });
});

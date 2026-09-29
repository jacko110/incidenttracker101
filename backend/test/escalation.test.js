const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
process.env.DATABASE_PATH = ':memory:';
process.env.SMTP_HOST = '';
process.env.JWT_SECRET = 'escalation-isolated-test-secret';
const db = require('../db');
const { sendOverdueEscalations } = require('../services/deadlines');
const { applyPolicy } = require('../services/sla');
const due = hours => new Date(Date.now() + hours * 3600000).toISOString();
const count = table => db.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n;
function incident(status = 'Attempt', archived = 0, hours = -1) {
  return db.prepare('INSERT INTO cases(title,status,archived,due_at,severity) VALUES (?,?,?,?,?)').run('Escalation evidence', status, archived, due(hours), 'High').lastInsertRowid;
}
beforeEach(() => {
  for (const table of ['notifications', 'case_history', 'cases', 'sla_policies', 'users']) db.prepare(`DELETE FROM ${table}`).run();
  for (const [name, role, active] of [['admin1','SOC_ADMIN',1],['admin2','SOC_ADMIN',1],['inactive','SOC_ADMIN',0],['analyst','SOC_ANALYST',1]]) {
    db.prepare('INSERT INTO users(username,password_hash,role,active) VALUES (?,?,?,?)').run(name,'unused',role,active);
  }
});
after(() => db.close());
test('unassigned overdue cases notify every active admin once and record system history', () => {
  const id = incident();
  assert.equal(sendOverdueEscalations(), 1);
  assert.equal(sendOverdueEscalations(), 0);
  assert.equal(count('notifications'), 2);
  assert.deepEqual(db.prepare('SELECT u.username FROM notifications n JOIN users u ON u.id=n.user_id ORDER BY u.username').all().map(row => row.username), ['admin1','admin2']);
  const history = db.prepare('SELECT * FROM case_history WHERE case_id=?').get(id);
  assert.equal(history.action, 'deadline_escalated'); assert.equal(history.actor_id, null);
  assert.ok(db.prepare('SELECT due_escalated_at FROM cases WHERE id=?').get(id).due_escalated_at);
});
test('closed, archived, future and undated cases are excluded', () => {
  incident('Completed'); incident('Rejected'); incident('Attempt',1); incident('Attempt',0,1);
  const id = incident(); db.prepare('UPDATE cases SET due_at=NULL WHERE id=?').run(id);
  assert.equal(sendOverdueEscalations(),0); assert.equal(count('notifications'),0);
});
test('no active admins leaves the case eligible for the next check', () => {
  incident(); db.prepare("UPDATE users SET active=0 WHERE role='SOC_ADMIN'").run();
  assert.equal(sendOverdueEscalations(),0);
  assert.equal(db.prepare('SELECT due_escalated_at FROM cases').get().due_escalated_at,null);
  db.prepare("UPDATE users SET active=1 WHERE username='admin1'").run();
  assert.equal(sendOverdueEscalations(),1); assert.equal(count('notifications'),1);
});
test('notification or audit failure rolls back escalation marker and all alerts', () => {
  incident();
  db.exec("CREATE TRIGGER reject_escalation BEFORE INSERT ON case_history BEGIN SELECT RAISE(ABORT,'audit unavailable'); END");
  try { assert.throws(sendOverdueEscalations,/audit unavailable/); }
  finally { db.exec('DROP TRIGGER reject_escalation'); }
  assert.equal(count('notifications'),0);
  assert.equal(db.prepare('SELECT due_escalated_at FROM cases').get().due_escalated_at,null);
  assert.equal(sendOverdueEscalations(),1);
});
test('changed SLA deadline resets escalation and applying the same deadline preserves it', () => {
  const id = incident();
  db.prepare("UPDATE cases SET created_at='2020-01-01 00:00:00' WHERE id=?").run(id);
  db.prepare("INSERT INTO sla_policies(severity,response_hours,enabled) VALUES ('High',4,1)").run();
  db.transaction(() => applyPolicy(id,null))(); sendOverdueEscalations();
  const marker = db.prepare('SELECT due_escalated_at FROM cases WHERE id=?').get(id).due_escalated_at;
  db.transaction(() => applyPolicy(id,null))();
  assert.equal(db.prepare('SELECT due_escalated_at FROM cases WHERE id=?').get(id).due_escalated_at,marker);
  db.prepare("UPDATE sla_policies SET response_hours=5").run();
  db.transaction(() => applyPolicy(id,null))();
  assert.equal(db.prepare('SELECT due_escalated_at FROM cases WHERE id=?').get(id).due_escalated_at,null);
  assert.equal(sendOverdueEscalations(),1);
});
test('email opt-out does not suppress in-app escalation', () => {
  const before = count('email_log');
  db.prepare("UPDATE users SET email='admin@example.invalid',email_notifications=0 WHERE role='SOC_ADMIN'").run();
  incident(); assert.equal(sendOverdueEscalations(),1);
  assert.equal(count('notifications'),2); assert.equal(count('email_log'),before);
});

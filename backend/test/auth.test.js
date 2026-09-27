const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
process.env.DATABASE_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-only-used-in-isolated-tests';
const db = require('../db');
const jwt = require('jsonwebtoken');
const express = require('express');
const { SECRET } = require('../middleware/auth');
let server, base, token;
before(async () => {
  db.prepare('INSERT INTO users (username,password_hash,role) VALUES (?,?,?)').run('tester','unused','SOC_ADMIN');
  db.prepare('INSERT INTO cases (title) VALUES (?)').run('Test case');
  token = jwt.sign({ id: 1, role: 'SOC_ADMIN', username: 'tester' }, SECRET, { expiresIn: '1h' });
  const app = express();
  app.use(express.json());
  app.use('/users', require('../routes/users'));
  app.use('/cases', require('../routes/cases'));
  app.use('/auth', require('../routes/auth'));
  await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { await new Promise(resolve => server.close(resolve)); db.close(); });
function request(path, method = 'GET', body, credential = token) {
  return fetch(base + path, { method, headers: { Authorization: `Bearer ${credential}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
}
test('existing token immediately respects demotion, promotion, deactivation and reactivation', async () => {
  assert.equal((await request('/users')).status, 200);
  db.prepare("UPDATE users SET role = 'SOC_ANALYST' WHERE id = 1").run();
  assert.equal((await request('/users')).status, 403);
  assert.equal((await request('/cases/1/reject', 'POST', {})).status, 403);
  assert.equal((await request('/cases/1/assign', 'POST', { userId: 1 })).status, 403);
  assert.equal((await request('/cases/1', 'PATCH', { archived: true })).status, 403);
  assert.equal((await request('/cases/1', 'PATCH', { status: 'Rejected' })).status, 400);
  assert.equal(db.prepare('SELECT status FROM cases WHERE id=1').get().status, 'Attempt');
  db.prepare("UPDATE users SET role = 'IR_ANALYST' WHERE id = 1").run();
  assert.equal((await request('/cases/1/reject', 'POST', {})).status, 200);
  assert.equal(db.prepare('SELECT rejected_by FROM cases WHERE id=1').get().rejected_by, 'IR Analyst');
  db.prepare("UPDATE users SET role = 'SOC_ADMIN', active = 0 WHERE id = 1").run();
  const denied = await request('/auth/me');
  assert.equal(denied.status, 403);
  assert.equal((await denied.json()).code, 'ACCOUNT_DEACTIVATED');
  db.prepare('UPDATE users SET active = 1 WHERE id = 1').run();
  assert.equal((await request('/users')).status, 200);
});
test('expired and invalid credentials are rejected', async () => {
  const expired = jwt.sign({ id: 1 }, SECRET, { expiresIn: -1 });
  assert.equal((await request('/auth/me', 'GET', undefined, expired)).status, 401);
  assert.equal((await request('/auth/me', 'GET', undefined, 'invalid')).status, 401);
});
test('production configuration fails closed and demo seeding requires opt-in', () => {
  const check = (env) => spawnSync(process.execPath, ['-e', 'console.log(require("./config").seedDemo)'], { cwd: require('node:path').join(__dirname, '..'), env: { ...process.env, SEED_DEMO: 'false', ...env }, encoding: 'utf8' });
  for (const secret of ['', 'short', 'change-me-to-a-long-random-string']) {
    assert.notEqual(check({ NODE_ENV: 'production', JWT_SECRET: secret }).status, 0);
  }
  assert.equal(check({ NODE_ENV: 'production' }).status, 0);
  assert.notEqual(check({ NODE_ENV: 'production', SEED_DEMO: 'true' }).status, 0);
  assert.equal(check({ NODE_ENV: 'development' }).stdout.trim(), 'false');
  assert.equal(check({ NODE_ENV: 'development', SEED_DEMO: 'true' }).stdout.trim(), 'true');
});

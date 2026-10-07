const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
process.env.DATABASE_PATH = ':memory:';
process.env.JWT_SECRET = 'isolated-security-test-secret';
process.env.SMTP_HOST = '';
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { configureSecurity, errorHandler } = require('../middleware/security');
let server, base, token;
before(async () => {
  db.prepare('INSERT INTO users(username,password_hash,role) VALUES (?,?,?)').run('security-admin', bcrypt.hashSync('security-password', 4), 'SOC_ADMIN');
  token = jwt.sign({ id: 1, auth_version: 0 }, process.env.JWT_SECRET);
  const app = express(); configureSecurity(app); app.use(express.json({ limit: '1kb' }));
  app.use('/api/auth', require('../routes/auth')); app.use('/api/users', require('../routes/users'));
  app.use(errorHandler);
  await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { await new Promise(resolve => server.close(resolve)); db.close(); });
const headers = () => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });
test('security headers, request IDs, private API caching and JSON limits', async () => {
  const response = await fetch(base + '/api/auth/me', { headers: headers() });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-powered-by'), null);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.ok(response.headers.get('x-request-id'));
  const malformed = await fetch(base + '/api/auth/login', { method: 'POST', headers: headers(), body: '{' });
  assert.equal(malformed.status, 400); assert.equal((await malformed.json()).error, 'Invalid JSON request body');
  const large = await fetch(base + '/api/auth/login', { method: 'POST', headers: headers(), body: JSON.stringify({ password: 'x'.repeat(2000) }) });
  assert.equal(large.status, 413);
});
test('login validates types and blocks username spraying from one IP', async () => {
  const invalid = await fetch(base + '/api/auth/login', { method: 'POST', headers: headers(), body: JSON.stringify({ username: {}, password: [] }) });
  assert.equal(invalid.status, 400);
  let blocked = false;
  for (let i = 0; i < 61; i++) {
    const response = await fetch(base + '/api/auth/login', { method: 'POST', headers: headers(), body: JSON.stringify({ username: `missing-${i}`, password: 'incorrect' }) });
    if (response.status === 429) { assert.ok(response.headers.get('retry-after')); blocked = true; break; }
    assert.equal(response.status, 401);
  }
  assert.ok(blocked);
});
test('last admin is preserved; password reset revokes existing tokens', async () => {
  const demote = await fetch(base + '/api/users/1', { method: 'PATCH', headers: headers(), body: JSON.stringify({ role: 'SOC_ANALYST' }) });
  assert.equal(demote.status, 400);
  const reset = await fetch(base + '/api/users/1', { method: 'PATCH', headers: headers(), body: JSON.stringify({ password: 'changed-security-password' }) });
  assert.equal(reset.status, 200);
  assert.equal((await fetch(base + '/api/auth/me', { headers: headers() })).status, 401);
  token = jwt.sign({ id: 1, auth_version: 1 }, process.env.JWT_SECRET);
  assert.equal((await fetch(base + '/api/auth/me', { headers: headers() })).status, 200);
});

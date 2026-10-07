const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fork } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const Database = require('better-sqlite3');
test('production server has CSP, denies cross-origin access, reports readiness and shuts down cleanly', async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'nib-production-'));
  const probe = net.createServer(); await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
  let child, output = '';
  const env = { ...process.env, NODE_ENV: 'production', JWT_SECRET: 'isolated-production-secret-at-least-32-characters', SEED_DEMO: 'false', DATABASE_PATH: path.join(temp, 'nib.db'), UPLOAD_DIR: path.join(temp, 'uploads'), SMTP_HOST: '', PORT: String(port), CORS_ORIGINS: '', TRUST_PROXY: '' };
  async function start() {
    output = '';
    child = fork(path.join(__dirname, '../server.js'), [], { env, silent: true });
    child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { output += chunk; });
    for (let i = 0; i < 100; i++) {
      if (output.includes('Nib backend running')) return;
      if (child.exitCode !== null) throw new Error(output);
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error('Production server did not start: ' + output);
  }
  try {
    await start();
    const ready = await fetch(`http://127.0.0.1:${port}/api/ready`, { headers: { Origin: 'https://untrusted.invalid' } });
    assert.equal(ready.status, 200); assert.equal(ready.headers.get('access-control-allow-origin'), null);
    assert.match(ready.headers.get('content-security-policy'), /script-src 'self'/);
    assert.match(ready.headers.get('strict-transport-security'), /max-age=31536000/);
    const app = await fetch(`http://127.0.0.1:${port}/cases/1`);
    assert.equal(app.status, 200); assert.match(await app.text(), /Nib Incident Tracking System/);
    const exited = new Promise(resolve => child.once('exit', resolve)); child.kill('SIGTERM');
    assert.equal(await exited, 0);
    assert.ok(!output.includes('untrusted.invalid'));
    const db = new Database(env.DATABASE_PATH);
    db.prepare('INSERT INTO users(username,password_hash,role) VALUES (?,?,?)').run('demo', require('bcryptjs').hashSync('password123', 4), 'SOC_ADMIN'); db.close();
    await assert.rejects(start(), /active account still uses the demo password/);
  } finally {
    if (child && child.exitCode === null) { const exited = new Promise(resolve => child.once('exit', resolve)); child.kill('SIGTERM'); await exited; }
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

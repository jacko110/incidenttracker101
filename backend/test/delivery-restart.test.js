const { test } = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { fork } = require('node:child_process');
const { once } = require('node:events');

async function until(predicate, description) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  assert.fail(`Timed out: ${description}`);
}

// A loopback-only SMTP receiver: no messages can leave this machine.
function mailReceiver() {
  const messages = [], sockets = new Set();
  const server = net.createServer(socket => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => {});
    socket.write('220 localhost test SMTP\r\n');
    let buffer = '', data = false, lines = [], recipient = '';
    socket.on('data', chunk => {
      buffer += chunk.toString();
      let end;
      while ((end = buffer.indexOf('\r\n')) !== -1) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        if (data) {
          if (line === '.') {
            messages.push({ recipient, raw: lines.join('\r\n') });
            data = false;
            lines = [];
            socket.write('250 Message accepted\r\n');
          } else lines.push(line.replace(/^\.\./, '.'));
        } else if (/^(EHLO|HELO)/i.test(line)) socket.write('250 localhost\r\n');
        else if (/^MAIL FROM:/i.test(line)) socket.write('250 Sender OK\r\n');
        else if (/^RCPT TO:/i.test(line)) {
          recipient = line;
          socket.write(line.includes('reject@') ? '550 Mailbox rejected for test\r\n' : '250 Recipient OK\r\n');
        } else if (/^DATA$/i.test(line)) {
          data = true;
          socket.write('354 End with dot\r\n');
        } else if (/^QUIT$/i.test(line)) socket.end('221 Bye\r\n');
        else socket.write('250 OK\r\n');
      }
    });
  });
  return { server, messages, sockets };
}

test('SMTP acceptance and rejection, hourly scheduling, restart deduplication and offline catch-up', { timeout: 20000 }, async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'nib-delivery-'));
  const receiver = mailReceiver();
  let child, db, ticks = 0, intervals = [], output = '';
  async function stop() {
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
  }
  try {
    await new Promise(resolve => receiver.server.listen(0, '127.0.0.1', resolve));
    const environment = {
      ...process.env, NODE_ENV: 'test', SEED_DEMO: 'false', PORT: '0',
      DATABASE_PATH: path.join(temporary, 'nib.db'), UPLOAD_DIR: temporary,
      JWT_SECRET: 'isolated-delivery-test-secret-not-for-production',
      SMTP_HOST: '127.0.0.1', SMTP_PORT: String(receiver.server.address().port),
      SMTP_SECURE: 'false', SMTP_USER: '', SMTP_PASS: '',
      SMTP_FROM: 'Nib Alerts <alerts@example.invalid>',
    };
    process.env.DATABASE_PATH = environment.DATABASE_PATH;
    db = require('../db');
    const user = db.prepare('INSERT INTO users (username,password_hash,email) VALUES (?,?,?)')
      .run('recipient', 'unused', 'recipient@example.invalid').lastInsertRowid;
    const insertCase = db.prepare('INSERT INTO cases (title,assigned_to,due_at) VALUES (?,?,?)');
    const overdue = new Date(Date.now() - 3600000).toISOString();
    const first = insertCase.run('Restart evidence', user, overdue).lastInsertRowid;
    const count = table => db.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n;
    async function start() {
      const previous = intervals.length;
      child = fork(path.join(__dirname, '../server.js'), [], {
        env: environment, silent: true,
        execArgv: ['--require', path.join(__dirname, '../test-support/fast-reminder-clock.cjs')],
      });
      child.stdout.on('data', chunk => { output += chunk; });
      child.stderr.on('data', chunk => { output += chunk; });
      child.on('message', message => {
        if (message.tick) ticks++;
        if (message.interval) intervals.push(message.interval);
      });
      await until(() => intervals.length > previous, `backend startup: ${output}`);
    }
    await start();
    await until(() => count('email_log') === 1, 'initial SMTP delivery');
    assert.equal(count('notifications'), 1);
    assert.equal(receiver.messages.length, 1);
    assert.match(receiver.messages[0].recipient, /recipient@example.invalid/);
    assert.match(receiver.messages[0].raw, /Subject: =\?UTF-8\?Q\?Nib=3A_Case_/);
    assert.match(db.prepare('SELECT subject FROM email_log').get().subject, /Nib: Case #\d+ is overdue/);
    assert.match(receiver.messages[0].raw, /Restart evidence/);
    assert.equal(db.prepare('SELECT status FROM email_log').get().status, 'sent');
    const marker = db.prepare('SELECT due_reminded_at FROM cases WHERE id=?').get(first).due_reminded_at;
    assert.ok(marker);

    await stop();
    await start();
    const restartTick = ticks;
    await until(() => ticks >= restartTick + 3, 'repeated scheduler ticks after restart');
    assert.equal(count('notifications'), 1);
    assert.equal(count('email_log'), 1);
    assert.equal(receiver.messages.length, 1);
    assert.equal(db.prepare('SELECT due_reminded_at FROM cases WHERE id=?').get(first).due_reminded_at, marker);

    // The server is offline when another case becomes overdue.
    await stop();
    insertCase.run('Became overdue while offline', user, overdue);
    await start();
    await until(() => count('email_log') === 2, 'startup catch-up delivery');
    assert.equal(count('notifications'), 2);
    assert.match(receiver.messages[1].raw, /Became overdue while offline/);

    // Verify the interval callback notices a deadline change without a restart.
    const scheduled = insertCase.run('Interval delivery', user, new Date(Date.now() + 48 * 3600000).toISOString()).lastInsertRowid;
    const beforeTick = ticks;
    await until(() => ticks > beforeTick + 1, 'future case skipped');
    assert.equal(count('email_log'), 2);
    db.prepare('UPDATE cases SET due_at=? WHERE id=?').run(overdue, scheduled);
    await until(() => count('email_log') === 3, 'delivery from recurring timer');
    assert.equal(receiver.messages.length, 3);
    assert.ok(intervals.every(value => value === 3600000));

    // An SMTP rejection must be logged, while the in-app reminder persists.
    db.prepare('UPDATE users SET email=? WHERE id=?').run('reject@example.invalid', user);
    insertCase.run('SMTP failure evidence', user, overdue);
    await until(() => count('email_log') === 4, 'SMTP failure audit entry');
    const failure = db.prepare("SELECT * FROM email_log WHERE status='failed'").get();
    assert.match(failure.error, /550/);
    assert.equal(failure.recipient, 'reject@example.invalid');
    assert.equal(count('notifications'), 4);
    assert.equal(receiver.messages.length, 3);
    const failedTick = ticks;
    await until(() => ticks > failedTick + 2, 'scheduler continues after rejected email');
    assert.equal(count('email_log'), 4); // Existing policy: email failures are not retried.
    assert.equal(child.exitCode, null);

    // Isolate escalation checks from the assignee reminders above.
    await stop();
    db.prepare("UPDATE cases SET status='Completed'").run();
    const admin = db.prepare("INSERT INTO users(username,password_hash,role,email) VALUES (?,?,'SOC_ADMIN',?)")
      .run('supervisor','unused','reject@example.invalid').lastInsertRowid;
    const escalated = insertCase.run('Escalation SMTP rejection', null, overdue).lastInsertRowid;
    await start();
    await until(() => count('email_log') === 5, 'escalation SMTP rejection');
    assert.equal(count('notifications'), 5);
    assert.equal(db.prepare('SELECT user_id FROM notifications WHERE case_id=?').get(escalated).user_id, admin);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM case_history WHERE case_id=? AND action='deadline_escalated'").get(escalated).n, 1);
    const escalationMarker = db.prepare('SELECT due_escalated_at FROM cases WHERE id=?').get(escalated).due_escalated_at;
    assert.ok(escalationMarker);
    assert.equal(db.prepare("SELECT status FROM email_log ORDER BY id DESC LIMIT 1").get().status, 'failed');
    await stop(); await start();
    const escalationTick = ticks;
    await until(() => ticks > escalationTick + 2, 'escalation deduplication after restart');
    assert.equal(count('notifications'), 5); assert.equal(count('email_log'), 5);
    assert.equal(db.prepare('SELECT due_escalated_at FROM cases WHERE id=?').get(escalated).due_escalated_at, escalationMarker);
    db.prepare('UPDATE users SET email=? WHERE id=?').run('supervisor@example.invalid', admin);
    insertCase.run('Escalation SMTP acceptance', null, overdue);
    await until(() => count('email_log') === 6, 'escalation SMTP acceptance');
    assert.equal(receiver.messages.length, 4);
    assert.match(receiver.messages[3].recipient, /supervisor@example.invalid/);
    assert.match(receiver.messages[3].raw, /Escalation SMTP acceptance/);
    assert.equal(count('notifications'), 6);
    assert.equal(db.prepare("SELECT status FROM email_log ORDER BY id DESC LIMIT 1").get().status, 'sent');
  } finally {
    await stop();
    for (const socket of receiver.sockets) socket.destroy();
    if (receiver.server.listening) await new Promise(resolve => receiver.server.close(resolve));
    db?.close();
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

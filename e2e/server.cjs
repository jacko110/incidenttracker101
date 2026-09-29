const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'nib-browser-'));
Object.assign(process.env, {
  DATABASE_PATH: path.join(temporary, 'nib.db'),
  UPLOAD_DIR: temporary,
  JWT_SECRET: 'nib-browser-test-secret-not-for-production',
  SMTP_HOST: '', SEED_DEMO: 'false', NODE_ENV: 'test', PORT: '4015',
});
const db = require('../backend/db');
const bcrypt = require('../backend/node_modules/bcryptjs');
for (const [username, role] of [['analyst', 'SOC_ANALYST'], ['admin', 'SOC_ADMIN'], ['ir', 'IR_ANALYST']]) {
  db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)').run(username, bcrypt.hashSync('browser-password', 4), role);
}
function cleanup() {
  db.close();
  fs.rmSync(temporary, { recursive: true, force: true });
  process.exit(0);
}
process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);
require('../backend/server');

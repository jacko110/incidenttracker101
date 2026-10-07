require('dotenv').config();
const bcrypt = require('bcryptjs');
require('./config');
const db = require('./db');
async function main() {
  const username = process.env.ADMIN_USERNAME?.trim();
  const password = process.env.ADMIN_PASSWORD;
  if (!username || username.length > 100 || !password || password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) {
    throw new Error('Set ADMIN_USERNAME and ADMIN_PASSWORD (at least 12 characters).');
  }
  const passwordHash = await bcrypt.hash(password, 12);
  db.transaction(() => {
    if (db.prepare("SELECT id FROM users WHERE role='SOC_ADMIN'").get()) {
      throw new Error('An admin already exists; use User management to create additional accounts.');
    }
    db.prepare('INSERT INTO users(username,password_hash,role) VALUES (?,?,?)')
      .run(username, passwordHash, 'SOC_ADMIN');
  })();
  console.log('Initial admin created.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => db.close());

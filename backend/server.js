require("dotenv").config();
const express = require("express");
const { seedDemo, production } = require("./config");
if (seedDemo) require("./seed");

const authRoutes = require("./routes/auth");
const caseRoutes = require("./routes/cases");
const chatRoutes = require("./routes/chat");
const uploadRoutes = require("./routes/uploads");
const notificationRoutes = require("./routes/notifications");
const userRoutes = require("./routes/users");
const iocRoutes = require("./routes/iocs");

const app = express();
const { configureSecurity, errorHandler } = require('./middleware/security');
configureSecurity(app);
app.use(express.json({ limit: '1mb' }));
const db = require('./db');
if (production) {
  if (!require('fs').existsSync(require('path').join(__dirname, '../frontend/dist/index.html'))) {
    throw new Error('Production requires a built frontend. Run npm --prefix frontend run build or use Docker.');
  }
  const bcrypt = require('bcryptjs');
  const demo = db.prepare('SELECT password_hash FROM users WHERE active=1').all()
    .some(user => bcrypt.compareSync('password123', user.password_hash));
  if (demo) throw new Error('Production startup refused: an active account still uses the demo password. Reset it before deployment.');
}

app.get("/api/health", (req, res) => res.json({ ok: true }));
app.get('/api/ready', (req, res) => {
  try { db.prepare('SELECT 1').get(); res.json({ ok: true }); }
  catch { res.status(503).json({ ok: false }); }
});

app.use("/api/auth", authRoutes);
app.use("/api/cases", caseRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/uploads", uploadRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/users", userRoutes);
app.use("/api/iocs", iocRoutes);
app.use("/api/audit", require("./routes/audit"));
app.use("/api", require("./routes/playbooks"));
app.use("/api", require("./routes/sla"));

// Serve the built application when running the packaged production server.
const path = require('path');
const fs = require('fs');
const frontendDist = path.join(__dirname, '..', 'frontend', 'dist');
app.use('/api', (req, res) => res.status(404).json({ error: 'API route not found' }));
if (fs.existsSync(path.join(frontendDist, 'index.html'))) {
  app.use(express.static(frontendDist));
  app.get('*', (req, res) => res.sendFile(path.join(frontendDist, 'index.html')));
}
app.use(errorHandler);

const PORT = process.env.PORT || 4000;
let reminderTimer;
function runDeadlineCheck() {
  try { require('./services/deadlines').checkDeadlines(); }
  catch (error) { console.error(JSON.stringify({ event: 'deadline_check_failed', message: error.message })); }
}
const server = app.listen(PORT, () => {
  console.log(`Nib backend running on http://localhost:${PORT}`);
  if (seedDemo) console.log("Demo accounts enabled for development.");
  runDeadlineCheck();
  reminderTimer = setInterval(runDeadlineCheck, 60 * 60 * 1000);
  reminderTimer.unref();
  const { isConfigured } = require("./services/email");
  console.log(
    isConfigured
      ? "Email: SMTP configured, notifications will be sent for real"
      : "Email: no SMTP configured — notifications are logged to email_log, not sent (see backend/.env.example)"
  );
});
server.requestTimeout = 120000;
server.headersTimeout = 30000;
let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(JSON.stringify({ event: 'shutdown', signal }));
  clearInterval(reminderTimer);
  const timeout = setTimeout(() => process.exit(1), 10000);
  timeout.unref();
  server.close(() => { db.close(); process.exit(0); });
  server.closeIdleConnections?.();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

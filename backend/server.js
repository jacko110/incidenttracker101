require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { seedDemo } = require("./config");
if (seedDemo) require("./seed");

const authRoutes = require("./routes/auth");
const caseRoutes = require("./routes/cases");
const chatRoutes = require("./routes/chat");
const uploadRoutes = require("./routes/uploads");
const notificationRoutes = require("./routes/notifications");
const userRoutes = require("./routes/users");
const iocRoutes = require("./routes/iocs");

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => res.json({ ok: true }));

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

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Nib backend running on http://localhost:${PORT}`);
  if (seedDemo) console.log("Demo accounts enabled for development.");
  const { checkDeadlines } = require("./services/deadlines");
  checkDeadlines();
  const reminderTimer = setInterval(checkDeadlines, 60 * 60 * 1000);
  reminderTimer.unref();
  const { isConfigured } = require("./services/email");
  console.log(
    isConfigured
      ? "Email: SMTP configured, notifications will be sent for real"
      : "Email: no SMTP configured — notifications are logged to email_log, not sent (see backend/.env.example)"
  );
});

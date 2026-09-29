const nodemailer = require("nodemailer");
const db = require("../db");

// Real SMTP is used only if SMTP_HOST is set (see .env.example). Without it,
// we use nodemailer's built-in jsonTransport, which never touches the
// network — it just serializes what *would* have been sent. Every attempt,
// real or not, is written to email_log so you can verify notification
// content and delivery status without needing real mail credentials to
// develop or test against.
const isConfigured = !!process.env.SMTP_HOST;

const transporter = isConfigured
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === "true",
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    })
  : nodemailer.createTransport({ jsonTransport: true });

const FROM = process.env.SMTP_FROM || "Nib Alerts <alerts@nib.local>";

function logAttempt({ recipient, subject, body, status, error }) {
  db.prepare(
    "INSERT INTO email_log (recipient, subject, body, status, error) VALUES (?, ?, ?, ?, ?)"
  ).run(recipient, subject, body || null, status, error || null);
}

// Fire-and-forget by design: callers (e.g. case assignment/rejection) run in
// synchronous better-sqlite3 request handlers and shouldn't block the HTTP
// response on mail delivery. Failures are logged, never thrown to the caller.
async function sendEmail({ to, subject, text, html }) {
  if (!to) {
    return { skipped: true, reason: "No recipient email on file" };
  }
  try {
    const info = await transporter.sendMail({ from: FROM, to, subject, text, html });
    logAttempt({
      recipient: to,
      subject,
      body: text,
      status: isConfigured ? "sent" : "logged (no SMTP configured)",
    });
    return { sent: true, mode: isConfigured ? "smtp" : "dev-log", info };
  } catch (err) {
    logAttempt({ recipient: to, subject, body: text, status: "failed", error: err.message });
    return { sent: false, error: err.message };
  }
}

module.exports = { sendEmail, isConfigured };

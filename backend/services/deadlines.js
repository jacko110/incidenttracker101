const db = require("../db");
const { sendEmail } = require("./email");

const DUE_SOON_HOURS = 24;

function sendDueReminders() {
  const dueCases = db.prepare(`
    SELECT c.id, c.title, c.due_at, c.assigned_to, u.username, u.email, u.email_notifications
    FROM cases c JOIN users u ON u.id = c.assigned_to
    WHERE c.archived = 0 AND c.due_at IS NOT NULL AND c.due_reminded_at IS NULL
      AND c.status NOT IN ('Completed', 'Rejected')
      AND datetime(c.due_at) <= datetime('now', '+${DUE_SOON_HOURS} hours')
      AND u.active = 1
    ORDER BY datetime(c.due_at) ASC
  `).all();
  const markReminded = db.prepare("UPDATE cases SET due_reminded_at = CURRENT_TIMESTAMP WHERE id = ? AND due_reminded_at IS NULL");
  const addNotification = db.prepare("INSERT INTO notifications (user_id, case_id, message) VALUES (?, ?, ?)");
  const createReminder = db.transaction((item, message) => {
    const mark = markReminded.run(item.id);
    if (!mark.changes) return false;
    addNotification.run(item.assigned_to, item.id, message);
    return true;
  });

  for (const item of dueCases) {
    const overdue = Date.parse(item.due_at) <= Date.now();
    const message = overdue
      ? `Case #${item.id} is overdue: \"${item.title}\"`
      : `Case #${item.id} is due within 24 hours: \"${item.title}\"`;
    if (!createReminder(item, message)) continue;
    if (item.email && item.email_notifications) {
      sendEmail({
        to: item.email,
        subject: `Nib: ${message}`,
        text: `Hi ${item.username},\n\n${message}\nResponse deadline: ${item.due_at}\n\nView the case: /cases/${item.id}\n\n— Nib Incident Tracking`,
      }).catch(() => {});
    }
  }
  return dueCases.length;
}

module.exports = { DUE_SOON_HOURS, sendDueReminders };

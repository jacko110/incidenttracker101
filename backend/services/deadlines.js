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

function sendOverdueEscalations() {
  const admins = db.prepare("SELECT id,username,email,email_notifications FROM users WHERE role='SOC_ADMIN' AND active=1").all();
  // Keep cases eligible if there is currently nobody to notify.
  if (!admins.length) return 0;
  const cases = db.prepare(`SELECT id,title,due_at FROM cases
    WHERE archived=0 AND status NOT IN ('Completed','Rejected')
      AND due_escalated_at IS NULL AND due_at IS NOT NULL
      AND datetime(due_at) < datetime('now') ORDER BY datetime(due_at),id`).all();
  const record = db.transaction((incident, message) => {
    const changed = db.prepare(`UPDATE cases SET due_escalated_at=CURRENT_TIMESTAMP
      WHERE id=? AND due_escalated_at IS NULL AND due_at=?
        AND archived=0 AND status NOT IN ('Completed','Rejected')`).run(incident.id, incident.due_at);
    if (!changed.changes) return false;
    const notify = db.prepare('INSERT INTO notifications(user_id,case_id,message) VALUES (?,?,?)');
    for (const admin of admins) notify.run(admin.id, incident.id, message);
    db.prepare('INSERT INTO case_history(case_id,actor_id,action,detail) VALUES (?,NULL,?,?)')
      .run(incident.id, 'deadline_escalated', `Overdue deadline escalated to SOC Admins: ${admins.map(admin => admin.username).join(', ')}`);
    return true;
  });
  let count = 0;
  for (const incident of cases) {
    const message = `Escalation: case #${incident.id} is overdue: "${incident.title}"`;
    if (!record(incident, message)) continue;
    count++;
    for (const admin of admins) {
      if (admin.email && admin.email_notifications) sendEmail({
        to: admin.email, subject: `Nib: ${message}`,
        text: `Hi ${admin.username},\n\n${message}\nResponse deadline: ${incident.due_at}\nView the case: /cases/${incident.id}\n\nPlease review ownership and next actions.`,
      }).catch(() => {});
    }
  }
  return count;
}

function checkDeadlines() {
  sendDueReminders();
  sendOverdueEscalations();
}
module.exports = { DUE_SOON_HOURS, sendDueReminders, sendOverdueEscalations, checkDeadlines };

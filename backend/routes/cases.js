const express = require("express");
const db = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { sendEmail } = require("../services/email");

const router = express.Router();
router.use(requireAuth);

const STATUSES = ["Under Review", "In Progress", "Completed", "Attempt", "Rejected"];

// Role -> the label that appears in cases.rejected_by when that role rejects a case
const REJECTOR_LABEL = {
  SOC_ADMIN: "SOC Admin",
  IR_ANALYST: "IR Analyst",
};

function parseJson(v) {
  if (!v) return null;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

function logHistory(caseId, actorId, action, detail) {
  db.prepare(
    "INSERT INTO case_history (case_id, actor_id, action, detail) VALUES (?, ?, ?, ?)"
  ).run(caseId, actorId ?? null, action, detail ?? null);
}

function notify(userId, caseId, message) {
  if (!userId) return;
  db.prepare(
    "INSERT INTO notifications (user_id, case_id, message) VALUES (?, ?, ?)"
  ).run(userId, caseId ?? null, message);

  const recipient = db
    .prepare("SELECT email, email_notifications, username FROM users WHERE id = ?")
    .get(userId);

  if (recipient?.email && recipient.email_notifications) {
    const caseLine = caseId ? `\n\nView the case: /cases/${caseId}` : "";
    // Not awaited on purpose — this runs inside synchronous better-sqlite3
    // request handlers and shouldn't block the HTTP response on mail
    // delivery. sendEmail() logs its own success/failure to email_log.
    sendEmail({
      to: recipient.email,
      subject: `BlueB: ${message}`,
      text: `Hi ${recipient.username},\n\n${message}${caseLine}\n\n— BlueB Incident Tracking`,
    }).catch(() => {});
  }
}

function hydrateCase(row) {
  if (!row) return row;
  return {
    ...row,
    source_ip: parseJson(row.source_ip),
    destination_ip: parseJson(row.destination_ip),
    http_status: parseJson(row.http_status),
    iocs: parseJson(row.iocs),
  };
}

// Returns every case linked to `caseId`, regardless of which side of the
// (case_id_a, case_id_b) pair it's stored on, with the *other* case's
// summary info attached so the UI can render a simple list.
function getLinkedCases(caseId) {
  const id = Number(caseId);
  const rows = db
    .prepare(
      `SELECT
         cl.id as link_id, cl.note, cl.created_at as linked_at, cl.linked_by,
         u.username as linked_by_username,
         c.id as case_id, c.title, c.status, c.severity, c.archived
       FROM case_links cl
       JOIN cases c ON c.id = (CASE WHEN cl.case_id_a = ? THEN cl.case_id_b ELSE cl.case_id_a END)
       LEFT JOIN users u ON u.id = cl.linked_by
       WHERE cl.case_id_a = ? OR cl.case_id_b = ?
       ORDER BY cl.created_at DESC`
    )
    .all(id, id, id);
  return rows;
}

function saveIocsTable(caseId, iocs) {
  if (!Array.isArray(iocs)) return;
  db.prepare("DELETE FROM iocs WHERE case_id = ?").run(caseId);
  const insert = db.prepare(`
    INSERT INTO iocs (case_id, type, value, threat_intelligence, count, percentage, description, images, documents)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const ioc of iocs) {
    insert.run(
      caseId,
      ioc.type || "Unspecified",
      ioc.value || null,
      ioc.threatIntelligence || null,
      ioc.count ? Number(ioc.count) : null,
      ioc.percentage ? Number(ioc.percentage) : null,
      ioc.description || null,
      ioc.images ? JSON.stringify(ioc.images) : null,
      ioc.documents ? JSON.stringify(ioc.documents) : null
    );
  }
}

// GET /api/cases?status=&archived=&assignedToMe=1&q=&page=&pageSize=
router.get("/", (req, res) => {
  const { status, archived, assignedToMe, q, page, pageSize } = req.query;

  const where = ["archived = ?"];
  const params = [archived === "1" ? 1 : 0];

  if (status) {
    where.push("status = ?");
    params.push(status);
  }
  if (assignedToMe === "1") {
    where.push("assigned_to = ?");
    params.push(req.user.id);
  }
  if (q && q.trim()) {
    where.push("(title LIKE ? OR attack_type LIKE ? OR origin_country LIKE ? OR asset_name LIKE ?)");
    const like = `%${q.trim()}%`;
    params.push(like, like, like, like);
  }

  const whereClause = `WHERE ${where.join(" AND ")}`;
  const total = db.prepare(`SELECT COUNT(*) c FROM cases ${whereClause}`).get(...params).c;

  const p = Math.max(1, parseInt(page, 10) || 1);
  const size = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 25));
  const offset = (p - 1) * size;

  const rows = db
    .prepare(`SELECT * FROM cases ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...params, size, offset);

  res.json({
    data: rows,
    pagination: { page: p, pageSize: size, total, totalPages: Math.max(1, Math.ceil(total / size)) },
  });
});

// GET /api/cases/stats -> dashboard summary (?from=YYYY-MM-DD&to=YYYY-MM-DD optional)
router.get("/stats", (req, res) => {
  const { from, to } = req.query;
  const dateWhere = [];
  const dateParams = [];
  if (from) {
    dateWhere.push("created_at >= ?");
    dateParams.push(from);
  }
  if (to) {
    dateWhere.push("created_at <= ?");
    dateParams.push(`${to} 23:59:59`);
  }
  const dateClause = dateWhere.length ? `AND ${dateWhere.join(" AND ")}` : "";

  const total = db
    .prepare(`SELECT COUNT(*) c FROM cases WHERE archived = 0 ${dateClause}`)
    .get(...dateParams).c;

  const byStatus = {};
  for (const s of STATUSES) {
    byStatus[s] = db
      .prepare(`SELECT COUNT(*) c FROM cases WHERE status = ? AND archived = 0 ${dateClause}`)
      .get(s, ...dateParams).c;
  }

  const trend = db
    .prepare(
      `SELECT strftime('%m', created_at) month, COUNT(*) c
       FROM cases WHERE archived = 0 ${dateClause} GROUP BY month ORDER BY month`
    )
    .all(...dateParams);

  const attackTypes = db
    .prepare(
      `SELECT attack_type, COUNT(*) c FROM cases
       WHERE archived = 0 AND attack_type IS NOT NULL ${dateClause}
       GROUP BY attack_type ORDER BY c DESC`
    )
    .all(...dateParams);

  const severity = db
    .prepare(
      `SELECT COALESCE(severity,'N/A') severity, COUNT(*) c FROM cases
       WHERE archived = 0 ${dateClause} GROUP BY severity`
    )
    .all(...dateParams);

  const origins = db
    .prepare(
      `SELECT origin_country country, COUNT(*) c FROM cases
       WHERE archived = 0 AND origin_country IS NOT NULL ${dateClause}
       GROUP BY origin_country ORDER BY c DESC LIMIT 5`
    )
    .all(...dateParams);
  const originTotal = origins.reduce((a, o) => a + o.c, 0) || 1;

  res.json({
    total,
    byStatus,
    trend,
    attackTypes,
    severity,
    origins: origins.map((o) => ({
      country: o.country,
      attacks: o.c,
      pct: Math.round((o.c / originTotal) * 100),
    })),
  });
});

// GET /api/cases/lookup/users -> for the assignment dropdown
router.get("/lookup/users", (req, res) => {
  res.json(
    db.prepare("SELECT id, username, role FROM users WHERE active = 1 ORDER BY username").all()
  );
});

// GET /api/cases/:id
router.get("/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM cases WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Case not found" });

  const notes = db
    .prepare(
      `SELECT n.*, u.username FROM case_notes n
       LEFT JOIN users u ON u.id = n.author_id
       WHERE case_id = ? ORDER BY n.created_at ASC`
    )
    .all(req.params.id);

  const history = db
    .prepare(
      `SELECT h.*, u.username FROM case_history h
       LEFT JOIN users u ON u.id = h.actor_id
       WHERE case_id = ? ORDER BY h.created_at DESC`
    )
    .all(req.params.id);

  const iocRows = db
    .prepare("SELECT * FROM iocs WHERE case_id = ? ORDER BY created_at ASC")
    .all(req.params.id)
    .map((r) => ({
      ...r,
      images: parseJson(r.images) || [],
      documents: parseJson(r.documents) || [],
    }));

  const assignee = row.assigned_to
    ? db.prepare("SELECT id, username, role FROM users WHERE id = ?").get(row.assigned_to)
    : null;

  const linkedCases = getLinkedCases(req.params.id);

  res.json({ ...hydrateCase(row), notes, history, iocRecords: iocRows, assignee, linkedCases });
});

// POST /api/cases
router.post("/", (req, res) => {
  const {
    title,
    severity,
    attack_type,
    origin_country,
    source_ip,
    destination_ip,
    incident_datetime,
    asset_name,
    shift,
    http_status,
    summary,
    impact,
    recommendations,
    iocs,
  } = req.body || {};
  if (!title) return res.status(400).json({ error: "Title is required" });

  const info = db
    .prepare(
      `INSERT INTO cases (
        title, status, severity, attack_type, origin_country, assigned_to,
        source_ip, destination_ip, incident_datetime, asset_name, shift,
        http_status, summary, impact, recommendations, iocs
      ) VALUES (?, 'Attempt', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      title,
      severity || "N/A",
      attack_type || null,
      origin_country || null,
      req.user.id,
      source_ip ? JSON.stringify(source_ip) : null,
      destination_ip ? JSON.stringify(destination_ip) : null,
      incident_datetime || null,
      asset_name || null,
      shift || null,
      http_status ? JSON.stringify(http_status) : null,
      summary || null,
      impact || null,
      recommendations || null,
      iocs ? JSON.stringify(iocs) : null
    );

  const caseId = info.lastInsertRowid;
  if (iocs) saveIocsTable(caseId, iocs);
  logHistory(caseId, req.user.id, "created", `Case created by ${req.user.username}`);

  if ((severity || "").toLowerCase() === "critical") {
    const admins = db
      .prepare("SELECT id FROM users WHERE role = 'SOC_ADMIN' AND active = 1")
      .all();
    for (const admin of admins) {
      notify(admin.id, caseId, `Critical incident reported: "${title}"`);
    }
  }

  res.status(201).json(hydrateCase(db.prepare("SELECT * FROM cases WHERE id = ?").get(caseId)));
});

// PATCH /api/cases/:id — status / severity. Archiving requires SOC_ADMIN.
// rejected_by is NOT settable here — use POST /:id/reject so the label always
// matches the acting role rather than trusting client input.
router.patch("/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM cases WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Case not found" });

  const { status, severity, archived } = req.body || {};
  if (status === "Rejected") {
    return res.status(400).json({ error: "Use the dedicated reject action to reject a case" });
  }
  if (status && !STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of ${STATUSES.join(", ")}` });
  }
  if (archived !== undefined && req.user.role !== "SOC_ADMIN") {
    return res.status(403).json({ error: "Only SOC Admin can archive or restore cases" });
  }

  db.prepare(
    `UPDATE cases SET
      status = COALESCE(?, status),
      severity = COALESCE(?, severity),
      archived = COALESCE(?, archived),
      updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  ).run(status ?? null, severity ?? null, archived === undefined ? null : archived ? 1 : 0, req.params.id);

  if (status && status !== existing.status) {
    logHistory(req.params.id, req.user.id, "status_changed", `Status changed from "${existing.status}" to "${status}"`);
  }
  if (severity && severity !== existing.severity) {
    logHistory(req.params.id, req.user.id, "edited", `Severity changed from "${existing.severity}" to "${severity}"`);
  }
  if (archived !== undefined) {
    logHistory(req.params.id, req.user.id, archived ? "archived" : "restored", archived ? "Case archived" : "Case restored from archive");
  }

  res.json(hydrateCase(db.prepare("SELECT * FROM cases WHERE id = ?").get(req.params.id)));
});

// PUT /api/cases/:id — full field edit (alert details), any authenticated user
const EDITABLE_FIELDS = [
  "title", "attack_type", "origin_country", "asset_name", "shift",
  "summary", "impact", "recommendations", "incident_datetime",
];
const EDITABLE_JSON_FIELDS = ["source_ip", "destination_ip", "http_status"];

router.put("/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM cases WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Case not found" });

  const changes = [];
  const sets = [];
  const params = [];

  for (const field of EDITABLE_FIELDS) {
    if (req.body[field] !== undefined && req.body[field] !== existing[field]) {
      sets.push(`${field} = ?`);
      params.push(req.body[field]);
      changes.push(field);
    }
  }
  for (const field of EDITABLE_JSON_FIELDS) {
    if (req.body[field] !== undefined) {
      const newVal = JSON.stringify(req.body[field]);
      if (newVal !== existing[field]) {
        sets.push(`${field} = ?`);
        params.push(newVal);
        changes.push(field);
      }
    }
  }

  if (sets.length === 0) {
    return res.json(hydrateCase(existing));
  }

  sets.push("updated_at = CURRENT_TIMESTAMP");
  db.prepare(`UPDATE cases SET ${sets.join(", ")} WHERE id = ?`).run(...params, req.params.id);
  logHistory(req.params.id, req.user.id, "edited", `Updated fields: ${changes.join(", ")}`);

  res.json(hydrateCase(db.prepare("SELECT * FROM cases WHERE id = ?").get(req.params.id)));
});

// POST /api/cases/:id/reject — requires SOC_ADMIN or IR_ANALYST.
// The rejected_by label is derived from the caller's role, never trusted from the body.
router.post("/:id/reject", requireRole("SOC_ADMIN", "IR_ANALYST"), (req, res) => {
  const existing = db.prepare("SELECT * FROM cases WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Case not found" });

  const label = REJECTOR_LABEL[req.user.role];
  const { reason } = req.body || {};

  db.prepare(
    `UPDATE cases SET status = 'Rejected', rejected_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).run(label, req.params.id);

  logHistory(req.params.id, req.user.id, "rejected", `Rejected by ${label}${reason ? `: ${reason}` : ""}`);

  if (existing.assigned_to && existing.assigned_to !== req.user.id) {
    notify(existing.assigned_to, req.params.id, `Case #${req.params.id} was rejected by ${label}`);
  }

  res.json(hydrateCase(db.prepare("SELECT * FROM cases WHERE id = ?").get(req.params.id)));
});

// POST /api/cases/:id/assign — requires SOC_ADMIN
router.post("/:id/assign", requireRole("SOC_ADMIN"), (req, res) => {
  const existing = db.prepare("SELECT * FROM cases WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Case not found" });

  const { userId } = req.body || {};
  const target = userId ? db.prepare("SELECT * FROM users WHERE id = ?").get(userId) : null;
  if (userId && !target) return res.status(400).json({ error: "Assignee not found" });

  db.prepare("UPDATE cases SET assigned_to = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(
    userId || null,
    req.params.id
  );

  logHistory(
    req.params.id,
    req.user.id,
    "assigned",
    target ? `Assigned to ${target.username}` : "Unassigned"
  );

  if (target) notify(target.id, req.params.id, `Case #${req.params.id} was assigned to you`);

  res.json(hydrateCase(db.prepare("SELECT * FROM cases WHERE id = ?").get(req.params.id)));
});

// POST /api/cases/:id/notes
router.post("/:id/notes", (req, res) => {
  const { body } = req.body || {};
  if (!body) return res.status(400).json({ error: "Note body required" });
  const info = db
    .prepare("INSERT INTO case_notes (case_id, author_id, body) VALUES (?, ?, ?)")
    .run(req.params.id, req.user.id, body);
  res.status(201).json(
    db.prepare("SELECT * FROM case_notes WHERE id = ?").get(info.lastInsertRowid)
  );
});

// POST /api/cases/:id/links — link this case to another related case.
// Any authenticated role can link (it's a cross-reference, not a destructive
// action), but both cases must actually exist and can't be linked to itself.
router.post("/:id/links", (req, res) => {
  const caseId = Number(req.params.id);
  const { targetCaseId, note } = req.body || {};
  const target = Number(targetCaseId);

  if (!target) return res.status(400).json({ error: "targetCaseId is required" });
  if (target === caseId) return res.status(400).json({ error: "A case can't be linked to itself" });

  const thisCase = db.prepare("SELECT id, title FROM cases WHERE id = ?").get(caseId);
  const targetCase = db.prepare("SELECT id, title FROM cases WHERE id = ?").get(target);
  if (!thisCase) return res.status(404).json({ error: "Case not found" });
  if (!targetCase) return res.status(404).json({ error: "Target case not found" });

  // Store with the smaller id first so (A,B) and (B,A) can't both exist —
  // the UNIQUE(case_id_a, case_id_b) constraint then genuinely prevents dupes.
  const [a, b] = caseId < target ? [caseId, target] : [target, caseId];

  const existing = db
    .prepare("SELECT id FROM case_links WHERE case_id_a = ? AND case_id_b = ?")
    .get(a, b);
  if (existing) return res.status(409).json({ error: "These cases are already linked" });

  db.prepare(
    "INSERT INTO case_links (case_id_a, case_id_b, note, linked_by) VALUES (?, ?, ?, ?)"
  ).run(a, b, note || null, req.user.id);

  logHistory(caseId, req.user.id, "edited", `Linked to case #${target} ("${targetCase.title}")`);
  logHistory(target, req.user.id, "edited", `Linked to case #${caseId} ("${thisCase.title}")`);

  res.status(201).json({ linkedCases: getLinkedCases(caseId) });
});

// DELETE /api/cases/:id/links/:linkId
router.delete("/:id/links/:linkId", (req, res) => {
  const link = db.prepare("SELECT * FROM case_links WHERE id = ?").get(req.params.linkId);
  if (!link) return res.status(404).json({ error: "Link not found" });

  const caseId = Number(req.params.id);
  if (link.case_id_a !== caseId && link.case_id_b !== caseId) {
    return res.status(400).json({ error: "That link does not belong to this case" });
  }

  db.prepare("DELETE FROM case_links WHERE id = ?").run(req.params.linkId);
  logHistory(caseId, req.user.id, "edited", `Removed a case link`);

  res.json({ linkedCases: getLinkedCases(caseId) });
});

module.exports = router;

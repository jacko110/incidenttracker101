import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Pencil, Save, X, UserPlus, XCircle, History, Paperclip, Plus,
} from "lucide-react";
import { Panel } from "../components/Panel";
import { StatusPill, RejectedByPill, CaseId } from "../components/StatusPill";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";
import { canReject, canArchive, canAssign } from "../permissions";

import CasePlaybooks from "../components/CasePlaybooks";

const STATUSES = ["Under Review", "In Progress", "Completed", "Attempt"];

const HISTORY_LABELS = {
  created: "Created",
  status_changed: "Status changed",
  rejected: "Rejected",
  assigned: "Assignment",
  edited: "Edited",
  archived: "Archived",
  restored: "Restored",
  deadline_changed: "Deadline changed",
  deadline_escalated: "Escalated to SOC Admins",
  playbook_attached: "Playbook attached",
  playbook_task_assigned: "Task assigned",
  playbook_task_completed: "Task completed",
  playbook_task_reopened: "Task reopened",
};

export default function CaseDetail() {
  const { id } = useParams();
  const { token, user } = useAuth();
  const navigate = useNavigate();

  const [item, setItem] = useState(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState(null);

  const [users, setUsers] = useState([]);
  const [assigning, setAssigning] = useState(false);
  const [deadlineInput, setDeadlineInput] = useState("");
  const [savingDeadline, setSavingDeadline] = useState(false);

  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkTargetId, setLinkTargetId] = useState("");
  const [linkNote, setLinkNote] = useState("");
  const [linking, setLinking] = useState(false);

  function load() {
    api.caseDetail(token, id).then(setItem).catch((e) => setError(e.message));
  }

  useEffect(load, [token, id]);
  useEffect(() => {
    if (!item?.due_at) { setDeadlineInput(""); return; }
    const date = new Date(item.due_at);
    setDeadlineInput(Number.isNaN(date.getTime()) ? "" : new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16));
  }, [item?.due_at]);
  useEffect(() => {
    if (canAssign(user.role)) api.listUsers(token).then(setUsers).catch(() => {});
  }, [token, user.role]);

  async function applySla() {
    setSavingDeadline(true); setError("");
    try { await api.applySla(token, id); load(); }
    catch (err) { setError(err.message); }
    finally { setSavingDeadline(false); }
  }

  async function submitLink(e) {
    e.preventDefault();
    if (!linkTargetId) return;
    setLinking(true);
    setError("");
    try {
      await api.linkCase(token, id, Number(linkTargetId), linkNote || undefined);
      setShowLinkModal(false);
      setLinkTargetId("");
      setLinkNote("");
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setLinking(false);
    }
  }

  async function removeLink(linkId) {
    setError("");
    try {
      await api.unlinkCase(token, id, linkId);
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function updateStatus(status) {
    setBusy(true);
    setError("");
    try {
      await api.updateCase(token, id, { status });
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function archiveCase() {
    setBusy(true);
    setError("");
    try {
      await api.updateCase(token, id, { archived: 1 });
      navigate("/archive");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function rejectCase() {
    const reason = window.prompt("Reason for rejection (optional):");
    if (reason === null) return;
    setBusy(true);
    setError("");
    try {
      await api.rejectCase(token, id, reason || undefined);
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveDeadline(e) {
    e.preventDefault();
    setSavingDeadline(true);
    setError("");
    try {
      await api.updateCase(token, id, { due_at: deadlineInput ? new Date(deadlineInput).toISOString() : null });
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSavingDeadline(false);
    }
  }

  async function clearDeadline() {
    setSavingDeadline(true);
    setError("");
    try {
      await api.updateCase(token, id, { due_at: null });
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSavingDeadline(false);
    }
  }

  async function handleAssign(e) {
    const userId = e.target.value ? Number(e.target.value) : null;
    setAssigning(true);
    setError("");
    try {
      await api.assignCase(token, id, userId);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setAssigning(false);
    }
  }

  function startEdit() {
    setEditForm({
      title: item.title || "",
      attack_type: item.attack_type || "",
      origin_country: item.origin_country || "",
      asset_name: item.asset_name || "",
      shift: item.shift || "",
      summary: item.summary || "",
      impact: item.impact || "",
      recommendations: item.recommendations || "",
    });
    setEditing(true);
  }

  async function saveEdit() {
    setBusy(true);
    setError("");
    try {
      await api.editCase(token, id, editForm);
      setEditing(false);
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitNote(e) {
    e.preventDefault();
    if (!note.trim()) return;
    try {
      await api.addNote(token, id, note.trim());
      setNote("");
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  if (error && !item) return <div className="text-thread text-sm p-4 font-mono">{error}</div>;
  if (!item) return <div className="text-faint text-sm p-4 font-mono">Loading case...</div>;

  return (
    <div className="space-y-4">
      {error && (
        <div className="text-sm text-thread bg-thread/10 border border-thread/30 rounded px-3 py-2 font-mono">
          {error}
        </div>
      )}

      <Panel>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <CaseId id={item.id} className="text-sm" />
            {editing ? (
              <input
                value={editForm.title}
                onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
                className="w-full mt-1.5 bg-panel2 border border-line rounded px-3 py-2 text-lg text-paper outline-none focus:border-amber transition-colors"
              />
            ) : (
              <h2 className="font-display text-lg text-paper font-semibold mt-0.5">{item.title}</h2>
            )}
            {item.rejected_by && (
              <div className="mt-2"><RejectedByPill label={item.rejected_by} /></div>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {editing ? (
              <>
                <button
                  onClick={() => setEditing(false)}
                  className="flex items-center gap-1.5 text-xs bg-panel2 border border-line hover:border-linestrong text-paper px-3 py-1.5 rounded transition-colors"
                >
                  <X size={13} /> Cancel
                </button>
                <button
                  onClick={saveEdit}
                  disabled={busy}
                  className="flex items-center gap-1.5 text-xs bg-cyan hover:brightness-110 disabled:opacity-50 text-ink font-semibold px-3 py-1.5 rounded transition-all"
                >
                  <Save size={13} /> Save
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={startEdit}
                  className="flex items-center gap-1.5 text-xs bg-panel2 border border-line hover:border-linestrong text-paper px-3 py-1.5 rounded transition-colors"
                >
                  <Pencil size={13} /> Edit
                </button>
                {canReject(user.role) && item.status !== "Rejected" && (
                  <button
                    onClick={rejectCase}
                    disabled={busy}
                    className="flex items-center gap-1.5 text-xs bg-thread/10 hover:bg-thread/20 text-thread px-3 py-1.5 rounded disabled:opacity-50 transition-colors"
                  >
                    <XCircle size={13} /> Reject
                  </button>
                )}
                {canArchive(user.role) && (
                  <button
                    onClick={archiveCase}
                    disabled={busy}
                    className="text-xs bg-panel2 border border-line hover:border-linestrong text-paper px-3 py-1.5 rounded disabled:opacity-50 transition-colors"
                  >
                    Archive case
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {editing ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5 text-sm">
            <EditField label="Attack type" value={editForm.attack_type} onChange={(v) => setEditForm((f) => ({ ...f, attack_type: v }))} />
            <EditField label="Origin" value={editForm.origin_country} onChange={(v) => setEditForm((f) => ({ ...f, origin_country: v }))} />
            <EditField label="Asset" value={editForm.asset_name} onChange={(v) => setEditForm((f) => ({ ...f, asset_name: v }))} />
            <EditField label="Shift" value={editForm.shift} onChange={(v) => setEditForm((f) => ({ ...f, shift: v }))} />
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5 text-sm">
            <ReadStat label="Attack type" value={item.attack_type} />
            <ReadStat label="Origin" value={item.origin_country} />
            <ReadStat label="Severity" value={item.severity} />
            <ReadStat label="Created" value={item.created_at?.slice(0, 10)} mono />
          </div>
        )}

        {editing && (
          <div className="space-y-4 mt-4">
            <EditTextarea label="Summary" value={editForm.summary} onChange={(v) => setEditForm((f) => ({ ...f, summary: v }))} />
            <EditTextarea label="Impact" value={editForm.impact} onChange={(v) => setEditForm((f) => ({ ...f, impact: v }))} />
            <EditTextarea label="Initial recommendations" value={editForm.recommendations} onChange={(v) => setEditForm((f) => ({ ...f, recommendations: v }))} />
          </div>
        )}

        {!editing && (item.summary || item.impact || item.recommendations) && (
          <div className="space-y-3 mt-4 text-sm">
            {item.summary && <ReadField label="Summary" value={item.summary} />}
            {item.impact && <ReadField label="Impact" value={item.impact} />}
            {item.recommendations && <ReadField label="Initial recommendations" value={item.recommendations} />}
          </div>
        )}

        <div className="mt-5">
          <div className="font-mono text-[10px] uppercase tracking-widest text-faint mb-2">Status</div>
          <div className="flex flex-wrap gap-2">
            {STATUSES.map((s) => (
              <button
                key={s}
                onClick={() => updateStatus(s)}
                disabled={busy}
                className={`text-xs px-3 py-1.5 rounded border transition-colors disabled:opacity-50 ${
                  item.status === s
                    ? "bg-amber/15 border-amber text-amber"
                    : "border-line text-muted hover:bg-panel2"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5">
          <div className="font-mono text-[10px] uppercase tracking-widest text-faint mb-2 flex items-center gap-1.5">
            <UserPlus size={12} /> Assigned to
          </div>
          {canAssign(user.role) ? (
            <select
              value={item.assigned_to || ""}
              onChange={handleAssign}
              disabled={assigning}
              className="bg-panel2 border border-line rounded px-3 py-2 text-sm text-paper outline-none focus:border-amber disabled:opacity-50 transition-colors"
            >
              <option value="">Unassigned</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.username} ({u.role})</option>
              ))}
            </select>
          ) : (
            <div className="text-sm text-paper">
              {item.assignee ? `${item.assignee.username} (${item.assignee.role})` : "Unassigned"}
            </div>
          )}
        </div>

        <div className="mt-5 border-t border-line pt-4">
          <div className="font-mono text-[10px] uppercase tracking-widest text-faint mb-2">Response deadline</div>
          {canAssign(user.role) ? (
            <form onSubmit={saveDeadline} className="flex flex-wrap items-center gap-2">
              <input
                aria-label="Response deadline"
                type="datetime-local"
                value={deadlineInput}
                onChange={(e) => setDeadlineInput(e.target.value)}
                className="bg-panel2 border border-line rounded px-3 py-2 text-sm text-paper outline-none focus:border-amber"
              />
              <button type="submit" disabled={savingDeadline} className="text-xs bg-cyan text-ink font-semibold px-3 py-2 rounded disabled:opacity-50">
                {savingDeadline ? "Saving…" : "Save deadline"}
              </button>
              {item.due_at && <button type="button" disabled={savingDeadline} onClick={clearDeadline} className="text-xs text-muted hover:text-paper px-2 py-2 disabled:opacity-50">Clear</button>}
            </form>
          ) : (
            <div className="text-sm text-paper">{item.due_at ? new Date(item.due_at).toLocaleString() : "No deadline set"}</div>
          )}
          <p className="text-xs text-muted mt-2">{item.deadline_source === 'sla' ? 'Deadline source: severity SLA policy' : item.deadline_source === 'manual' || item.due_at ? 'Deadline source: manual override' : 'No SLA deadline applied'}</p>
          {canAssign(user.role) && !item.archived && !['Completed', 'Rejected'].includes(item.status) && <div className="mt-2">
            <button type="button" disabled={savingDeadline} onClick={applySla} className="text-xs text-cyan border border-line rounded px-3 py-2 disabled:opacity-50">Apply current SLA policy</button>
            <p className="text-xs text-muted mt-1">Replaces the deadline using the current severity and original case creation time. An older case may become overdue.</p>
          </div>}
          <p className="text-[11px] text-faint mt-2">Assigned users receive one reminder when the case is due within 24 hours. Overdue cases are escalated once to active SOC Admins on the next hourly check.</p>
          {item.due_escalated_at && <p className="text-xs text-thread mt-2">Escalated to SOC Admins · {new Date(item.due_escalated_at.replace(' ', 'T') + 'Z').toLocaleString()}</p>}
        </div>
      </Panel>

      {item.iocRecords && item.iocRecords.length > 0 && (
        <Panel title={`Indicators of compromise (${item.iocRecords.length})`}>
          <div className="space-y-3">
            {item.iocRecords.map((ioc) => (
              <div key={ioc.id} className="bg-panel2 border border-line rounded px-3 py-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] uppercase tracking-wide text-paper">{ioc.type}</span>
                  <span className="text-xs text-faint">{ioc.threat_intelligence}</span>
                </div>
                {(ioc.count || ioc.percentage) && (
                  <div className="font-mono text-[10px] text-faint mt-1">
                    {ioc.count ? `count: ${ioc.count}` : ""} {ioc.percentage ? `· ${ioc.percentage}%` : ""}
                  </div>
                )}
                {ioc.description && <div className="text-paper text-sm mt-1.5">{ioc.description}</div>}
                {(ioc.images.length > 0 || ioc.documents.length > 0) && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {[...ioc.images, ...ioc.documents].map((f) => (
                      <a
                        key={f.storedName}
                        href={api.fileUrl(token, f.url)}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 text-[11px] text-cyan hover:brightness-125 bg-panel rounded px-2 py-1 transition-all"
                      >
                        <Paperclip size={10} /> {f.originalName}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* Linked cases — the thread/pin treatment is deliberate: this is the
          one place in the app that visually nods to an evidence board,
          because it's the one place doing exactly that job. */}
      <Panel
        title={`Linked cases ${item.linkedCases?.length ? `(${item.linkedCases.length})` : ""}`}
        right={
          <button
            onClick={() => setShowLinkModal(true)}
            className="flex items-center gap-1 text-xs bg-panel2 border border-line hover:border-linestrong text-paper px-2.5 py-1.5 rounded transition-colors"
          >
            <Plus size={12} /> Link a case
          </button>
        }
      >
        {!item.linkedCases || item.linkedCases.length === 0 ? (
          <div className="text-faint text-sm py-2">
            No related cases linked yet. Link cases that share infrastructure, a threat actor, or a campaign.
          </div>
        ) : (
          <div className="space-y-2">
            {item.linkedCases.map((l) => (
              <div key={l.link_id} className="relative flex items-center justify-between bg-panel2 border border-line rounded pl-5 pr-3 py-2.5">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-amber shadow-[0_0_0_2px_rgba(217,162,68,0.25)]" />
                <div className="flex items-center gap-2 min-w-0">
                  <svg width="18" height="10" viewBox="0 0 18 10" className="shrink-0 text-thread" fill="none">
                    <path d="M0 1 Q9 9 18 1" stroke="currentColor" strokeWidth="1.3" />
                  </svg>
                  <button
                    onClick={() => navigate(`/cases/${l.case_id}`)}
                    className="text-sm text-paper hover:text-amber truncate text-left transition-colors"
                  >
                    <span className="font-mono text-[11px] text-muted mr-1.5">#{String(l.case_id).padStart(4, "0")}</span>
                    {l.title}
                  </button>
                  {l.archived ? <span className="font-mono text-[10px] text-faint shrink-0">(archived)</span> : null}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {l.note && <span className="text-xs text-faint hidden md:inline italic">"{l.note}"</span>}
                  <button
                    onClick={() => removeLink(l.link_id)}
                    className="text-faint hover:text-thread transition-colors"
                    title="Remove link"
                  >
                    <X size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {showLinkModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-panel border border-line rounded-md w-full max-w-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-paper font-semibold text-sm">Link to another case</h3>
              <button onClick={() => setShowLinkModal(false)} className="text-faint hover:text-paper transition-colors">
                <X size={16} />
              </button>
            </div>
            <form onSubmit={submitLink} className="space-y-3">
              <div>
                <label className="font-mono text-[10px] uppercase tracking-widest text-muted mb-1.5 block">Case ID</label>
                <input
                  type="number"
                  value={linkTargetId}
                  onChange={(e) => setLinkTargetId(e.target.value)}
                  placeholder="e.g. 147"
                  className="w-full bg-panel2 border border-line rounded px-3 py-2 text-sm text-paper outline-none focus:border-amber transition-colors"
                  autoFocus
                />
                <p className="text-[11px] text-faint mt-1">
                  Find the ID from the Case List or Incident Panel — shown as #ID.
                </p>
              </div>
              <div>
                <label className="font-mono text-[10px] uppercase tracking-widest text-muted mb-1.5 block">Why are these related? (optional)</label>
                <input
                  value={linkNote}
                  onChange={(e) => setLinkNote(e.target.value)}
                  placeholder="e.g. Same C2 infrastructure"
                  className="w-full bg-panel2 border border-line rounded px-3 py-2 text-sm text-paper outline-none focus:border-amber transition-colors"
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setShowLinkModal(false)} className="text-xs text-muted hover:text-paper px-3 py-2 transition-colors">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={linking}
                  className="bg-cyan hover:brightness-110 disabled:opacity-50 text-ink text-xs font-semibold px-4 py-2 rounded transition-all"
                >
                  {linking ? "Linking..." : "Link case"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <CasePlaybooks key={id} caseId={id} readOnly={Boolean(item.archived) || ["Completed", "Rejected"].includes(item.status)} onChange={load} />

      <Panel title="Notes">
        <div className="space-y-3 mb-4 max-h-64 overflow-y-auto">
          {item.notes.length === 0 && (
            <div className="text-faint text-sm">No notes yet.</div>
          )}
          {item.notes.map((n) => (
            <div key={n.id} className="bg-panel2 border border-line rounded px-3 py-2 text-sm">
              <div className="flex items-center justify-between font-mono text-[10px] text-faint mb-1">
                <span>{n.username || "Unknown"}</span>
                <span>{n.created_at?.slice(0, 16).replace("T", " ")}</span>
              </div>
              <div className="text-paper">{n.body}</div>
            </div>
          ))}
        </div>
        <form onSubmit={submitNote} className="flex gap-2">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add a note..."
            className="flex-1 bg-panel2 border border-line rounded px-3 py-2 text-sm text-paper outline-none focus:border-amber transition-colors"
          />
          <button
            type="submit"
            className="bg-cyan hover:brightness-110 text-ink text-sm font-semibold px-4 py-2 rounded transition-all"
          >
            Add
          </button>
        </form>
      </Panel>

      {item.history && item.history.length > 0 && (
        <Panel title="Activity history">
          <div className="space-y-3">
            {item.history.map((h) => (
              <div key={h.id} className="flex gap-3 text-sm">
                <History size={14} className="text-faint mt-0.5 shrink-0" />
                <div>
                  <div className="text-paper">
                    <span className="text-muted">{HISTORY_LABELS[h.action] || h.action}</span>
                    {h.detail ? ` — ${h.detail}` : ""}
                  </div>
                  <div className="font-mono text-[10px] text-faint mt-0.5">
                    {h.username || "System"} · {h.created_at?.slice(0, 16).replace("T", " ")}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}

function EditField({ label, value, onChange }) {
  return (
    <div>
      <label className="font-mono text-[10px] uppercase tracking-widest text-muted mb-1.5 block">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-panel2 border border-line rounded px-2.5 py-1.5 text-sm text-paper outline-none focus:border-amber transition-colors"
      />
    </div>
  );
}

function EditTextarea({ label, value, onChange }) {
  return (
    <div>
      <label className="font-mono text-[10px] uppercase tracking-widest text-muted mb-1.5 block">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className="w-full bg-panel2 border border-line rounded px-3 py-2 text-sm text-paper outline-none focus:border-amber resize-y transition-colors"
      />
    </div>
  );
}

function ReadField({ label, value }) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-widest text-faint mb-1">{label}</div>
      <div className="text-paper whitespace-pre-wrap">{value}</div>
    </div>
  );
}

function ReadStat({ label, value, mono }) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-widest text-faint mb-1">{label}</div>
      <div className={`text-paper ${mono ? "font-mono text-[13px]" : ""}`}>{value || "—"}</div>
    </div>
  );
}

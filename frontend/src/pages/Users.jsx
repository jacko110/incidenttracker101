import React, { useEffect, useState } from "react";
import { Panel } from "../components/Panel";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";
import { roleLabel } from "../permissions";
import { UserPlus, X, KeyRound, Mail, ChevronDown, ChevronUp } from "lucide-react";

const ROLES = ["SOC_ANALYST", "SOC_ADMIN", "IR_ANALYST"];

function CreateUserModal({ open, onClose, onCreated, token }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("SOC_ANALYST");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setUsername("");
      setPassword("");
      setRole("SOC_ANALYST");
      setError("");
    }
  }, [open]);

  if (!open) return null;

  async function submit(e) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const created = await api.createUser(token, { username, password, role });
      onCreated(created);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
      <div className="bg-panel border border-line rounded-xl w-full max-w-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-paper font-semibold text-sm">New User</h3>
          <button onClick={onClose} className="text-faint hover:text-paper">
            <X size={16} />
          </button>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="text-xs text-muted mb-1 block">Username</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-panel2 border border-line rounded px-3 py-2 text-sm text-paper outline-none focus:border-cyan"
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs text-muted mb-1 block">Password (min 12 characters)</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-panel2 border border-line rounded px-3 py-2 text-sm text-paper outline-none focus:border-cyan"
            />
          </div>
          <div>
            <label className="text-xs text-muted mb-1 block">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full bg-panel2 border border-line rounded px-3 py-2 text-sm text-paper outline-none focus:border-cyan"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>{roleLabel(r)}</option>
              ))}
            </select>
          </div>

          {error && <div className="text-xs text-thread">{error}</div>}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="text-xs text-muted hover:text-paper px-3 py-2">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="bg-cyan hover:brightness-110 disabled:opacity-50 text-onaccent text-xs font-medium px-4 py-2 rounded"
            >
              {saving ? "Creating..." : "Create user"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ResetPasswordModal({ userRow, onClose, onSaved, token }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  if (!userRow) return null;

  async function submit(e) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      await api.updateUser(token, userRow.id, { password });
      onSaved();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
      <div className="bg-panel border border-line rounded-xl w-full max-w-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-paper font-semibold text-sm">Reset password for {userRow.username}</h3>
          <button onClick={onClose} className="text-faint hover:text-paper">
            <X size={16} />
          </button>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="text-xs text-muted mb-1 block">New password (min 8 characters)</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-panel2 border border-line rounded px-3 py-2 text-sm text-paper outline-none focus:border-cyan"
              autoFocus
            />
          </div>
          {error && <div className="text-xs text-thread">{error}</div>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="text-xs text-muted hover:text-paper px-3 py-2">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="bg-cyan hover:brightness-110 disabled:opacity-50 text-onaccent text-xs font-medium px-4 py-2 rounded"
            >
              {saving ? "Saving..." : "Reset password"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Users() {
  const { token, user } = useAuth();
  const [users, setUsers] = useState([]);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [resetTarget, setResetTarget] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const [showEmailLog, setShowEmailLog] = useState(false);
  const [emailLog, setEmailLog] = useState([]);
  const [emailLogLoaded, setEmailLogLoaded] = useState(false);

  function load() {
    api.users(token).then(setUsers).catch((e) => setError(e.message));
  }

  useEffect(load, [token]);

  function toggleEmailLog() {
    const next = !showEmailLog;
    setShowEmailLog(next);
    if (next && !emailLogLoaded) {
      api.emailLog(token).then((rows) => {
        setEmailLog(rows);
        setEmailLogLoaded(true);
      }).catch((e) => setError(e.message));
    }
  }

  async function toggleActive(u) {
    setBusyId(u.id);
    setError("");
    try {
      await api.updateUser(token, u.id, { active: !u.active });
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  }

  async function changeRole(u, role) {
    setBusyId(u.id);
    setError("");
    try {
      await api.updateUser(token, u.id, { role });
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Panel
      title="User management"
      right={
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 bg-cyan hover:brightness-110 text-onaccent text-xs font-medium px-3 py-1.5 rounded"
        >
          <UserPlus size={13} /> New User
        </button>
      }
    >
      {error && (
        <div className="text-sm text-thread bg-thread/10 border border-thread/30 rounded px-3 py-2 mb-4">
          {error}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-faint border-b border-line text-xs">
              <th className="py-2 pr-4">Username</th>
              <th className="py-2 pr-4">Email</th>
              <th className="py-2 pr-4">Role</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Created</th>
              <th className="py-2 pr-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-line last:border-0 text-paper">
                <td className="py-2.5 pr-4 text-paper">
                  {u.username}
                  {u.id === user.id && <span className="text-[10px] text-faint ml-1.5">(you)</span>}
                </td>
                <td className="py-2.5 pr-4 text-muted">
                  {u.email ? (
                    <span className="flex items-center gap-1">
                      <Mail size={11} className={u.email_notifications ? "text-faint" : "text-faint"} />
                      <span className={u.email_notifications ? "" : "line-through text-faint"}>{u.email}</span>
                    </span>
                  ) : (
                    <span className="text-faint">—</span>
                  )}
                </td>
                <td className="py-2.5 pr-4">
                  <select
                    value={u.role}
                    onChange={(e) => changeRole(u, e.target.value)}
                    disabled={busyId === u.id}
                    className="bg-panel2 border border-line rounded-xl px-2 py-1 text-xs text-paper outline-none focus:border-cyan disabled:opacity-50"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>{roleLabel(r)}</option>
                    ))}
                  </select>
                </td>
                <td className="py-2.5 pr-4">
                  <span
                    className={`text-[11px] rounded-full px-2 py-0.5 font-medium ${
                      u.active ? "bg-moss/15 text-moss" : "bg-panel2 text-muted"
                    }`}
                  >
                    {u.active ? "Active" : "Deactivated"}
                  </span>
                </td>
                <td className="py-2.5 pr-4 text-faint">{u.created_at?.slice(0, 10)}</td>
                <td className="py-2.5 pr-4">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setResetTarget(u)}
                      className="flex items-center gap-1 text-xs text-muted hover:text-paper"
                    >
                      <KeyRound size={12} /> Reset password
                    </button>
                    {u.id !== user.id && (
                      <button
                        onClick={() => toggleActive(u)}
                        disabled={busyId === u.id}
                        className={`text-xs disabled:opacity-50 ${
                          u.active ? "text-thread hover:brightness-125" : "text-moss hover:brightness-125"
                        }`}
                      >
                        {u.active ? "Deactivate" : "Reactivate"}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 pt-4 border-t border-line">
        <button
          onClick={toggleEmailLog}
          className="flex items-center gap-1.5 text-sm text-paper hover:text-paper"
        >
          {showEmailLog ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          Email Log
          <span className="text-xs text-faint">(what the app has attempted to send)</span>
        </button>

        {showEmailLog && (
          <div className="mt-3">
            {emailLog.length === 0 && emailLogLoaded ? (
              <div className="text-faint text-sm py-4 text-center">No emails logged yet.</div>
            ) : (
              <div className="overflow-x-auto border border-line rounded">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-faint text-xs bg-panel2 border-b border-line">
                      <th className="py-2 px-3">Recipient</th>
                      <th className="py-2 px-3">Subject</th>
                      <th className="py-2 px-3">Status</th>
                      <th className="py-2 px-3">Sent at</th>
                    </tr>
                  </thead>
                  <tbody>
                    {emailLog.map((row) => (
                      <tr key={row.id} className="border-b border-line last:border-0">
                        <td className="py-2 px-3 text-paper">{row.recipient}</td>
                        <td className="py-2 px-3 text-muted">{row.subject}</td>
                        <td className="py-2 px-3">
                          <span
                            className={`text-[11px] rounded-full px-2 py-0.5 font-medium ${
                              row.status === "sent"
                                ? "bg-moss/15 text-moss"
                                : row.status === "failed"
                                ? "bg-thread/15 text-thread"
                                : "bg-panel2 text-muted"
                            }`}
                          >
                            {row.status}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-faint">{row.created_at?.slice(0, 16).replace("T", " ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      <CreateUserModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => load()}
        token={token}
      />
      <ResetPasswordModal
        userRow={resetTarget}
        onClose={() => setResetTarget(null)}
        onSaved={() => load()}
        token={token}
      />
    </Panel>
  );
}

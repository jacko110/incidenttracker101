import React, { useState } from "react";
import { Panel } from "../components/Panel";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";
import { roleLabel } from "../permissions";
import { Mail, Bell, BellOff } from "lucide-react";

export default function Profile() {
  const { token, user, updateUser } = useAuth();
  const [email, setEmail] = useState(user.email || "");
  const [notify, setNotify] = useState(user.email_notifications !== 0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const res = await api.updateMe(token, { email, email_notifications: notify });
      updateUser(res.user);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel title="My profile">
      <div className="max-w-md">
        <div className="flex items-center gap-3 mb-6 pb-6 border-b border-line">
          <div className="w-10 h-10 rounded-full bg-panel2 border border-line flex items-center justify-center font-mono text-sm text-amber">
            {(user.username || "?").slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div className="text-paper font-medium">{user.username}</div>
            <div className="font-mono text-[10px] tracking-widest uppercase text-faint mt-0.5">{roleLabel(user.role)}</div>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="font-mono text-[10px] uppercase tracking-widest text-muted mb-1.5 flex items-center gap-1.5">
              <Mail size={12} /> Contact email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full bg-panel2 border border-line rounded px-3 py-2 text-sm text-paper outline-none focus:border-amber transition-colors"
            />
            <p className="text-[11px] text-faint mt-1">
              Used for case assignment and critical incident alerts.
            </p>
          </div>

          <label className="flex items-center justify-between bg-panel2 border border-line rounded px-3 py-2.5 cursor-pointer">
            <div className="flex items-center gap-2 text-sm text-paper">
              {notify ? <Bell size={14} className="text-amber" /> : <BellOff size={14} className="text-faint" />}
              Email notifications
            </div>
            <input
              type="checkbox"
              checked={notify}
              onChange={(e) => setNotify(e.target.checked)}
              className="w-4 h-4 accent-cyan"
            />
          </label>

          {error && <div className="text-xs text-thread font-mono">{error}</div>}
          {saved && <div className="text-xs text-moss font-mono">Saved.</div>}

          <button
            type="submit"
            disabled={saving}
            className="bg-cyan hover:brightness-110 disabled:opacity-50 text-ink text-sm font-semibold px-4 py-2 rounded transition-all"
          >
            {saving ? "Saving..." : "Save changes"}
          </button>
        </form>
      </div>
    </Panel>
  );
}

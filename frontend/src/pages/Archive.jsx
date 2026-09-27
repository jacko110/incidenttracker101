import React, { useEffect, useState } from "react";
import { Panel } from "../components/Panel";
import { CaseId } from "../components/StatusPill";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";
import { canArchive } from "../permissions";

export default function Archive() {
  const { token, user } = useAuth();
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  function load() {
    setLoading(true);
    setError("");
    api
      .allCases(token, { archived: 1 })
      .then((res) => setCases(res.data))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, [token]);

  async function restore(id) {
    try {
      await api.updateCase(token, id, { archived: 0 });
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <Panel title="Archive">
      {error && <div className="text-thread text-sm mb-3 font-mono">{error}</div>}
      {!canArchive(user.role) && (
        <div className="text-xs text-muted bg-panel2 border border-line rounded px-3 py-2 mb-3">
          Only SOC Admin can restore archived cases — you can view this list, but restore actions are hidden.
        </div>
      )}
      {loading ? <div role="status">Loading archived cases…</div> : error ? null : cases.length === 0 ? (
        <div className="text-faint text-sm py-8 text-center font-mono">No archived cases.</div>
      ) : (
        <div className="space-y-2">
          {cases.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between bg-panel2 border border-line rounded px-3 py-2.5 text-sm"
            >
              <div>
                <div className="text-paper">{c.title}</div>
                <div className="text-xs text-faint mt-0.5 flex items-center gap-1.5">
                  <CaseId id={c.id} /> · {c.status}
                </div>
              </div>
              {canArchive(user.role) && (
                <button
                  onClick={() => restore(c.id)}
                  className="text-xs bg-line hover:bg-linestrong text-paper px-3 py-1.5 rounded transition-colors"
                >
                  Restore
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

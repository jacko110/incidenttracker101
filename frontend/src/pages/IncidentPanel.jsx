import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileSearch, Search, Plus, Globe, XCircle } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";
import { canReject } from "../permissions";
import { StatusPill, CaseId } from "../components/StatusPill";

const TABS = [
  { key: "new", label: "New incidents" },
  { key: "rejected_soc", label: "Rejected by SOC Admin" },
  { key: "rejected_ir", label: "Rejected by IR Analyst" },
];

export default function IncidentPanel() {
  const { token, user } = useAuth();
  const navigate = useNavigate();

  const [cases, setCases] = useState([]);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("new");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rejectingId, setRejectingId] = useState(null);

  function load() {
    setLoading(true);
    setError("");
    api
      .allCases(token)
      .then((res) => setCases(res.data))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, [token]);

  const counts = useMemo(() => {
    return {
      new: cases.filter((c) => !c.rejected_by && c.status !== "Rejected").length,
      rejected_soc: cases.filter((c) => c.rejected_by === "SOC Admin").length,
      rejected_ir: cases.filter((c) => c.rejected_by === "IR Analyst").length,
    };
  }, [cases]);

  const filtered = useMemo(() => {
    let rows = cases;
    if (tab === "new") rows = rows.filter((c) => !c.rejected_by && c.status !== "Rejected");
    if (tab === "rejected_soc") rows = rows.filter((c) => c.rejected_by === "SOC Admin");
    if (tab === "rejected_ir") rows = rows.filter((c) => c.rejected_by === "IR Analyst");

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          (c.attack_type || "").toLowerCase().includes(q) ||
          (c.origin_country || "").toLowerCase().includes(q)
      );
    }
    return rows;
  }, [cases, tab, search]);

  async function handleReject(c) {
    const reason = window.prompt(`Reject "${c.title}" as ${user.role === "SOC_ADMIN" ? "SOC Admin" : "IR Analyst"}? Optional reason:`);
    if (reason === null) return; // cancelled
    setRejectingId(c.id);
    setError("");
    try {
      await api.rejectCase(token, c.id, reason || undefined);
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setRejectingId(null);
    }
  }

  return (
    <div className="-m-6">
      {/* Header */}
      <div className="flex flex-wrap gap-3 items-center justify-between px-6 py-5 border-b border-line">
        <div className="flex items-center gap-2 text-paper">
          <FileSearch size={20} className="text-muted" />
          <h1 className="font-display text-lg font-semibold tracking-wide">Incident panel</h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-panel border border-line rounded px-3 py-2 w-64">
            <Search size={14} className="text-faint" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search incidents..."
              className="bg-transparent outline-none text-sm text-paper placeholder:text-faint w-full"
            />
          </div>
          <button
            onClick={() => navigate("/incidents/new")}
            className="flex items-center gap-1.5 bg-cyan hover:brightness-110 transition-all text-ink text-sm font-semibold px-4 py-2 rounded"
          >
            <Plus size={15} /> Create case
          </button>
          <button
            onClick={() => navigate("/incidents/new?defacement=1")}
            className="flex items-center gap-1.5 bg-panel2 border border-line hover:border-linestrong transition-colors text-paper text-sm font-medium px-4 py-2 rounded"
          >
            <Globe size={15} /> Defacement case
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex overflow-x-auto items-center gap-6 px-6 border-b border-line">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`relative py-3 text-sm transition-colors ${
              tab === t.key ? "text-amber" : "text-muted hover:text-paper"
            }`}
          >
            {t.label} <span className="font-mono text-[11px]">({counts[t.key]})</span>
            {tab === t.key && (
              <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-amber rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="p-6">
        {error && (
          <div className="text-sm text-thread bg-thread/10 border border-thread/30 rounded px-3 py-2 mb-4 font-mono">
            {error}
          </div>
        )}
        {loading ? <div role="status">Loading incidents…</div> : error ? null : filtered.length === 0 ? (
          <div className="text-faint text-sm py-16 text-center font-mono">No incidents in this view.</div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted border-b border-line font-body text-xs font-medium bg-panel2">
                  <th className="py-2.5 px-4">ID</th>
                  <th className="py-2.5 px-4">Title</th>
                  <th className="py-2.5 px-4">Attack type</th>
                  <th className="py-2.5 px-4">Origin</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4">Logged</th>
                  {tab === "new" && canReject(user.role) && <th className="py-2.5 px-4">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-line last:border-0 hover:bg-panel2 text-paper transition-colors"
                  >
                    <td className="py-2.5 px-4 cursor-pointer" onClick={() => navigate(`/cases/${c.id}`)}><CaseId id={c.id} /></td>
                    <td className="py-2.5 px-4 cursor-pointer" onClick={() => navigate(`/cases/${c.id}`)}>{c.title}</td>
                    <td className="py-2.5 px-4 cursor-pointer text-muted" onClick={() => navigate(`/cases/${c.id}`)}>{c.attack_type || "—"}</td>
                    <td className="py-2.5 px-4 cursor-pointer text-muted" onClick={() => navigate(`/cases/${c.id}`)}>{c.origin_country || "—"}</td>
                    <td className="py-2.5 px-4 cursor-pointer" onClick={() => navigate(`/cases/${c.id}`)}>
                      <StatusPill status={c.status} />
                    </td>
                    <td className="py-2.5 px-4 cursor-pointer font-mono text-[11px] text-faint" onClick={() => navigate(`/cases/${c.id}`)}>{c.created_at?.slice(0, 10)}</td>
                    {tab === "new" && canReject(user.role) && (
                      <td className="py-2.5 px-4">
                        <button
                          onClick={() => handleReject(c)}
                          disabled={rejectingId === c.id}
                          className="flex items-center gap-1 text-xs text-thread hover:brightness-125 disabled:opacity-50 transition-all"
                        >
                          <XCircle size={13} /> Reject
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

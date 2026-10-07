import React, { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Search, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Panel } from "../components/Panel";
import { StatusPill, CaseId } from "../components/StatusPill";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";

const PAGE_SIZE = 15;

export default function CaseList() {
  const { token } = useAuth();
  const [params, setParams] = useSearchParams();
  const status = params.get("status");
  const mineOnly = params.get("mine") === "1";
  const due = params.get("due");

  const [cases, setCases] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState(() => params.get("q") || "");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const query = params.get("q") || "";
    if (query !== search.trim()) {
      setSearch(query);
      setDebouncedSearch(query);
      setPage(1);
    }
  }, [params]);

  useEffect(() => setPage(1), [status, mineOnly, due, debouncedSearch]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    api
      .cases(token, { status, assignedToMe: mineOnly, q: debouncedSearch, due, page, pageSize: PAGE_SIZE })
      .then((res) => {
        if (!active) return;
        setCases(res.data);
        setPagination(res.pagination);
      })
      .catch((e) => { if (active) setError(e.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token, status, mineOnly, due, debouncedSearch, page]);

  const title = due === "overdue" ? "Overdue cases" : due === "upcoming" ? "Due within 24 hours" : mineOnly ? "My cases" : status ? `Cases · ${status}` : "All cases";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-end gap-4"><div><p className="eyebrow text-faint mb-3">Investigation workspace</p><h1 className="text-4xl sm:text-5xl font-bold">{title}</h1><p className="text-sm text-muted mt-3">Follow the signal. Track every investigation.</p></div><Link to="/incidents/new" className="flex items-center gap-2 bg-cyan text-onaccent rounded-lg px-4 py-3 text-sm font-semibold"><Plus size={16} />New incident</Link></div>
      <div className="flex gap-2 flex-wrap" aria-label="Case views">{[['All cases', '/cases', !status && !mineOnly && !due], ['My cases', '/cases?mine=1', mineOnly], ['Overdue', '/cases?due=overdue', due === 'overdue'], ['Due soon', '/cases?due=upcoming', due === 'upcoming']].map(([label, to, active]) => <Link key={label} to={to} className={`text-xs rounded-lg px-4 py-2 border ${active ? 'bg-paper text-ink border-paper' : 'bg-panel text-muted border-line hover:border-linestrong'}`}>{label}</Link>)}</div>
    <Panel title="Investigations" right={pagination && <span className="text-xs text-faint">{pagination.total} result{pagination.total === 1 ? '' : 's'}</span>}>
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <div className="flex items-center gap-2 bg-panel2 border border-line rounded-lg px-3 py-1 w-full sm:max-w-md">
          <Search size={14} className="text-faint" />
          <input
            aria-label="Filter cases"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              const next = new URLSearchParams(params);
              if (e.target.value.trim()) next.set("q", e.target.value.trim());
              else next.delete("q");
              setParams(next, { replace: true });
            }}
            placeholder="Search title, attack type, origin, asset..."
            className="bg-transparent outline-none text-sm text-paper placeholder:text-faint w-full"
          />
        </div>
      </div>

      {error && <div className="text-thread text-sm mb-3 font-mono">{error}</div>}
      {loading ? (
        <div className="text-faint text-sm py-8 text-center font-mono">Loading cases...</div>
      ) : cases.length === 0 ? (
        <div className="text-faint text-sm py-8 text-center font-mono">No cases found.</div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted border-b border-line font-body text-xs font-medium">
                  <th className="py-2 pr-4">ID</th>
                  <th className="py-2 pr-4">Title</th>
                  <th className="py-2 pr-4">Attack type</th>
                  <th className="py-2 pr-4">Origin</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Logged</th>
                  <th className="py-2 pr-4">Due</th>
                </tr>
              </thead>
              <tbody>
                {cases.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-line hover:bg-panel2 text-paper transition-colors"
                  >
                    <td className="py-2 pr-4"><CaseId id={c.id} /></td>
                    <td className="py-2 pr-4 min-w-[220px]"><Link to={`/cases/${c.id}`} className="font-semibold hover:underline">{c.title}</Link></td>
                    <td className="py-2 pr-4 text-muted">{c.attack_type || "—"}</td>
                    <td className="py-2 pr-4 text-muted">{c.origin_country || "—"}</td>
                    <td className="py-2 pr-4"><StatusPill status={c.status} /></td>
                    <td className="py-2 pr-4 font-mono text-[11px] text-faint">{c.created_at?.slice(0, 10)}</td>
                    <td className={`py-2 pr-4 font-mono text-[11px] ${c.due_at && new Date(c.due_at) < new Date() && !["Completed", "Rejected"].includes(c.status) ? "text-thread" : "text-faint"}`}>{c.due_at ? new Date(c.due_at).toLocaleString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 text-sm">
              <span className="font-mono text-[10px] text-faint uppercase tracking-widest">
                page {pagination.page} of {pagination.totalPages}
              </span>
              <div className="flex items-center gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="flex items-center gap-1 text-muted hover:text-paper disabled:opacity-30 disabled:hover:text-muted px-2 py-1 transition-colors"
                >
                  <ChevronLeft size={14} /> Prev
                </button>
                <button
                  disabled={page >= pagination.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="flex items-center gap-1 text-muted hover:text-paper disabled:opacity-30 disabled:hover:text-muted px-2 py-1 transition-colors"
                >
                  Next <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </Panel>
    </div>
  );
}

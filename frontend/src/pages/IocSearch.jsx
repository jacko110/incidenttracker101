import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, ChevronLeft, ChevronRight, Paperclip } from "lucide-react";
import { Panel } from "../components/Panel";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";

const PAGE_SIZE = 20;

export default function IocSearch() {
  const { token } = useAuth();
  const navigate = useNavigate();

  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [type, setType] = useState("");
  const [types, setTypes] = useState([]);
  const [page, setPage] = useState(1);

  const [results, setResults] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.iocTypes(token).then(setTypes).catch(() => {});
  }, [token]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => setPage(1), [debouncedQ, type]);

  useEffect(() => {
    setLoading(true);
    api
      .searchIocs(token, { q: debouncedQ, type, page, pageSize: PAGE_SIZE })
      .then((res) => {
        setResults(res.data);
        setPagination(res.pagination);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token, debouncedQ, type, page]);

  return (
    <Panel title="Search indicators of compromise">
      <p className="text-xs text-faint mb-4">
        Search every IOC ever recorded — by IP, domain, hash, description, or threat intel
        source — to find every case that references it.
      </p>

      <div className="flex items-center gap-2 mb-4">
        <div className="flex items-center gap-2 bg-panel2 border border-line rounded px-3 py-2 flex-1">
          <Search size={14} className="text-faint" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="e.g. 185.220.101.5, evil-domain.com, VirusTotal..."
            className="bg-transparent outline-none text-sm text-paper placeholder:text-faint w-full"
          />
        </div>
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="bg-panel2 border border-line rounded px-3 py-2 text-sm text-paper outline-none focus:border-cyan"
        >
          <option value="">All types</option>
          {types.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        {pagination && (
          <span className="text-xs text-faint whitespace-nowrap">{pagination.total} result{pagination.total === 1 ? "" : "s"}</span>
        )}
      </div>

      {error && <div className="text-thread text-sm mb-3">{error}</div>}

      {loading ? (
        <div className="text-faint text-sm py-8 text-center">Searching...</div>
      ) : results.length === 0 ? (
        <div className="text-faint text-sm py-8 text-center">
          {debouncedQ || type ? "No IOCs match that search." : "Start typing to search across all recorded IOCs."}
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {results.map((ioc) => (
              <div
                key={ioc.id}
                onClick={() => navigate(`/cases/${ioc.case_id}`)}
                className="bg-panel2 hover:bg-line rounded px-4 py-3 cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] uppercase tracking-wide bg-cyan/15 text-cyan rounded px-1.5 py-0.5">
                      {ioc.type}
                    </span>
                    {ioc.value && <span className="text-paper text-sm font-mono">{ioc.value}</span>}
                  </div>
                  <span className="text-xs text-faint">{ioc.threat_intelligence || "—"}</span>
                </div>
                <div className="text-sm text-muted mt-1">
                  Found in <span className="text-paper">{ioc.case_title}</span>
                  {ioc.case_archived ? <span className="text-faint"> (archived)</span> : null}
                  <span className="text-faint"> · {ioc.case_status}</span>
                </div>
                {ioc.description && <div className="text-xs text-faint mt-1">{ioc.description}</div>}
                {(ioc.images.length > 0 || ioc.documents.length > 0) && (
                  <div className="flex items-center gap-1 text-[11px] text-faint mt-1.5">
                    <Paperclip size={10} /> {ioc.images.length + ioc.documents.length} attachment(s)
                  </div>
                )}
              </div>
            ))}
          </div>

          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 text-sm">
              <span className="text-faint text-xs">
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <div className="flex items-center gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="flex items-center gap-1 text-muted hover:text-paper disabled:opacity-30 px-2 py-1"
                >
                  <ChevronLeft size={14} /> Prev
                </button>
                <button
                  disabled={page >= pagination.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="flex items-center gap-1 text-muted hover:text-paper disabled:opacity-30 px-2 py-1"
                >
                  Next <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </Panel>
  );
}

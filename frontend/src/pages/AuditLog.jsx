import React, { useEffect, useState } from 'react';
import { Download, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Panel } from '../components/Panel';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';

const PAGE_SIZE = 25;
const ACTIONS = [
  ['created', 'Created'], ['status_changed', 'Status changed'], ['rejected', 'Rejected'],
  ['assigned', 'Assigned'], ['edited', 'Edited'], ['deadline_changed', 'Deadline changed'],
  ['deadline_escalated', 'Deadline escalated'], ['archived', 'Archived'], ['restored', 'Restored'],
  ['playbook_attached', 'Playbook attached'], ['playbook_task_assigned', 'Playbook task assigned'],
  ['playbook_task_completed', 'Playbook task completed'], ['playbook_task_reopened', 'Playbook task reopened'],
];

function localTimestamp(value) {
  if (!value) return '—';
  const date = new Date(`${value.replace(' ', 'T')}Z`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export default function AuditLog() {
  const { token } = useAuth();
  const [filters, setFilters] = useState({ from: '', to: '', action: '', q: '' });
  const [applied, setApplied] = useState({ from: '', to: '', action: '', q: '' });
  const [refresh, setRefresh] = useState(0);
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    api.caseActivity(token, { ...applied, page, pageSize: PAGE_SIZE })
      .then(result => {
        if (!active) return;
        setRows(result.data);
        setPagination(result.pagination);
      })
      .catch(err => { if (active) { setRows([]); setPagination(null); setError(err.message); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token, applied, page, refresh]);

  function applyFilters(event) {
    event.preventDefault();
    setPage(1);
    setApplied({ ...filters, q: filters.q.trim() });
    setRefresh(value => value + 1);
  }

  async function exportCsv() {
    setExporting(true);
    setError('');
    try {
      const blob = await api.exportCaseActivity(token, applied);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'case-activity-history.csv';
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setError(err.message);
    } finally {
      setExporting(false);
    }
  }

  return <div className="space-y-5">
    <div>
      <h1 className="text-2xl font-semibold">Case activity</h1>
      <p className="text-sm text-muted mt-1">Search and export case audit events across investigations.</p>
    </div>

    <Panel title="Filter activity">
      <form onSubmit={applyFilters} className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3 items-end">
        <label className="text-xs text-muted">From
          <input type="date" value={filters.from} onChange={e => setFilters(current => ({ ...current, from: e.target.value }))} className="block w-full mt-1 bg-panel2 border border-line rounded-lg px-3 py-2 text-sm text-paper" />
        </label>
        <label className="text-xs text-muted">To
          <input type="date" value={filters.to} onChange={e => setFilters(current => ({ ...current, to: e.target.value }))} className="block w-full mt-1 bg-panel2 border border-line rounded-lg px-3 py-2 text-sm text-paper" />
        </label>
        <label className="text-xs text-muted">Action
          <select aria-label="Action" value={filters.action} onChange={e => setFilters(current => ({ ...current, action: e.target.value }))} className="block w-full mt-1 bg-panel2 border border-line rounded-lg px-3 py-2 text-sm text-paper">
            <option value="">All actions</option>
            {ACTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="text-xs text-muted">Search
          <span className="flex items-center gap-2 mt-1 bg-panel2 border border-line rounded-lg px-3 py-2"><Search size={14} className="text-faint" /><input aria-label="Search case activity" maxLength={200} value={filters.q} onChange={e => setFilters(current => ({ ...current, q: e.target.value }))} placeholder="Case, actor, or detail" className="min-w-0 w-full bg-transparent outline-none text-sm text-paper" /></span>
        </label>
        <button type="submit" className="bg-cyan text-onaccent rounded-lg px-4 py-2.5 text-sm font-semibold">Apply filters</button>
      </form>
    </Panel>

    {error && <p role="alert" className="text-sm text-thread">{error}</p>}
    <Panel title="Audit events" right={<div className="flex items-center gap-3"><span className="text-xs text-muted">{pagination?.total ?? 0} events</span><button type="button" onClick={exportCsv} disabled={exporting || loading || !pagination?.total} className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm disabled:opacity-40"><Download size={14} />{exporting ? 'Exporting…' : 'Export CSV'}</button></div>}>
      {loading ? <p role="status" className="text-sm text-muted">Loading activity…</p> : rows.length === 0 ? <p className="text-sm text-muted">No case activity matches these filters.</p> : <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm text-left">
          <thead><tr className="border-b border-line text-muted"><th className="py-2 pr-4">When</th><th className="py-2 pr-4">Case</th><th className="py-2 pr-4">Action</th><th className="py-2 pr-4">Actor</th><th className="py-2">Details</th></tr></thead>
          <tbody>{rows.map(row => <tr key={row.id} className="border-b border-line last:border-0 align-top">
            <td className="py-3 pr-4 whitespace-nowrap text-muted">{localTimestamp(row.created_at)}</td>
            <td className="py-3 pr-4"><Link to={`/cases/${row.case_id}`} className="text-cyan hover:underline">#{row.case_id}</Link><span className="block max-w-64 truncate text-xs text-muted" title={row.case_title}>{row.case_title}</span></td>
            <td className="py-3 pr-4 whitespace-nowrap text-paper">{ACTIONS.find(([action]) => action === row.action)?.[1] || row.action}</td>
            <td className="py-3 pr-4 text-paper">{row.actor}</td>
            <td className="py-3 min-w-64 text-muted whitespace-pre-wrap break-words">{row.detail || '—'}</td>
          </tr>)}</tbody>
        </table>
      </div>}
      <div className="flex items-center justify-between mt-4 border-t border-line pt-3">
        <span className="text-xs text-muted">Page {pagination?.page ?? 1} of {pagination?.totalPages ?? 1}</span>
        <div className="flex gap-2"><button type="button" disabled={loading || page <= 1} onClick={() => setPage(value => value - 1)} className="inline-flex items-center gap-1 rounded-lg border border-line px-3 py-2 text-sm disabled:opacity-40"><ChevronLeft size={14} />Previous</button><button type="button" disabled={loading || page >= (pagination?.totalPages ?? 1)} onClick={() => setPage(value => value + 1)} className="inline-flex items-center gap-1 rounded-lg border border-line px-3 py-2 text-sm disabled:opacity-40">Next<ChevronRight size={14} /></button></div>
      </div>
    </Panel>
  </div>;
}

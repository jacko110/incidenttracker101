import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { Panel } from '../components/Panel';

const defaults = [['Critical', 4], ['High', 8], ['Medium', 24], ['Low', 72]];
const severities = defaults.map(([severity]) => severity);
const HISTORY_PAGE_SIZE = 10;

export default function SlaPolicies() {
  const { token } = useAuth();
  const [policies, setPolicies] = useState([]);
  const [history, setHistory] = useState([]);
  const [historySeverity, setHistorySeverity] = useState('');
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPages, setHistoryPages] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    api.slaPolicies(token).then(rows => {
      if (!active) return;
      setPolicies(defaults.map(([severity, hours]) => {
        const saved = rows.find(row => row.severity === severity);
        return { severity, response_hours: saved?.response_hours ?? hours, enabled: Boolean(saved?.enabled) };
      }));
    }).catch(err => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);

  useEffect(() => {
    let active = true;
    setHistoryLoading(true);
    api.slaPolicyHistory(token, { severity: historySeverity, page: historyPage, pageSize: HISTORY_PAGE_SIZE })
      .then(result => {
        if (!active) return;
        setHistory(result.data);
        setHistoryPages(result.pagination.totalPages);
        setHistoryTotal(result.pagination.total);
      })
      .catch(err => { if (active) setError(err.message); })
      .finally(() => { if (active) setHistoryLoading(false); });
    return () => { active = false; };
  }, [token, historySeverity, historyPage, historyVersion]);

  function change(index, key, value) {
    setNotice('');
    setPolicies(rows => rows.map((row, i) => i === index ? { ...row, [key]: value } : row));
  }

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api.saveSlaPolicies(token, policies.map(row => ({ ...row, response_hours: Number(row.response_hours) })));
      setNotice('SLA policies saved. Existing case deadlines are unchanged.');
      setHistoryPage(1);
      setHistoryVersion(version => version + 1);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function changeHistorySeverity(value) {
    setHistorySeverity(value);
    setHistoryPage(1);
  }

  async function exportHistory() {
    setExporting(true);
    setError('');
    try {
      const blob = await api.exportSlaHistory(token, historySeverity);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `sla-policy-history-${historySeverity || 'all'}.csv`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice('SLA policy history CSV downloaded.');
    } catch (err) {
      setError(err.message);
    } finally {
      setExporting(false);
    }
  }

  return <div className="max-w-3xl space-y-4">
    <h1 className="text-xl font-semibold">SLA policies</h1>
    <p className="text-sm text-muted">Choose response deadlines by severity. Enabled policies apply when a case is created, using elapsed hours from creation, including nights and weekends.</p>
    <p className="text-sm text-muted">Initial response times are editable suggestions. Policies start disabled. Saving a policy does not change existing cases or manual overrides; admins can explicitly apply the current policy from a case.</p>
    {error && <p role="alert" className="text-thread">{error}</p>}
    {notice && <p role="status" className="text-cyan">{notice}</p>}

    {loading ? <p role="status">Loading policies…</p> : policies.length > 0 && <Panel title="Response times">
      <form onSubmit={save} className="space-y-4">
        <fieldset disabled={busy} className="space-y-4">
          {policies.map((row, index) => <div key={row.severity} className="flex flex-wrap gap-4 items-center border-b border-line pb-4">
            <label className="flex gap-2 items-center w-32"><input type="checkbox" checked={row.enabled} onChange={e => change(index, 'enabled', e.target.checked)} />{row.severity}</label>
            <label className="text-sm">{row.severity} response hours<input className="block w-32 bg-panel2 border border-line rounded px-3 py-2" type="number" min="1" max="8760" step="1" required value={row.response_hours} onChange={e => change(index, 'response_hours', e.target.value)} /></label>
          </div>)}
          <button className="bg-cyan text-onaccent rounded px-4 py-2 font-semibold" type="submit">{busy ? 'Saving…' : 'Save SLA policies'}</button>
        </fieldset>
      </form>
    </Panel>}

    <Panel title="Policy change history" right={<span className="text-xs text-muted">{historyTotal} change{historyTotal === 1 ? '' : 's'}</span>}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <label className="text-xs text-muted">Filter by severity
          <select value={historySeverity} onChange={e => changeHistorySeverity(e.target.value)} className="ml-2 bg-panel2 border border-line rounded px-3 py-2 text-sm text-paper">
            <option value="">All severities</option>
            {severities.map(severity => <option key={severity} value={severity}>{severity}</option>)}
          </select>
        </label>
        <div className="flex flex-wrap items-center gap-3">
          {historyPages > 1 && <span className="text-xs text-muted">Page {historyPage} of {historyPages}</span>}
          <button type="button" onClick={exportHistory} disabled={exporting || historyLoading || historyTotal === 0} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-line text-sm disabled:opacity-40">
            <Download size={14} />{exporting ? 'Exporting…' : 'Export CSV'}
          </button>
        </div>
      </div>
      {historyLoading ? <p role="status" className="text-sm text-muted">Loading history…</p> : history.length === 0 ? <p className="text-sm text-muted">No policy changes match this filter.</p> : <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead><tr className="border-b border-line text-muted"><th className="py-2 pr-4">Changed</th><th className="py-2 pr-4">Changed by</th><th className="py-2">Response targets</th></tr></thead>
          <tbody>{history.map(entry => <tr key={entry.id} className="border-b border-line last:border-0 align-top">
            <td className="py-3 pr-4 whitespace-nowrap text-muted">{new Date(`${entry.created_at.replace(' ', 'T')}Z`).toLocaleString()}</td>
            <td className="py-3 pr-4 text-paper">{entry.actor || 'Unknown user'}</td>
            <td className="py-3"><div className="flex flex-wrap gap-2">{entry.policies.map(policy => <span key={policy.severity} className="rounded-lg bg-panel2 px-2 py-1 text-xs"><span className="text-paper">{policy.severity}</span><span className="text-muted"> · {policy.enabled ? `${policy.response_hours}h` : 'Disabled'}</span></span>)}</div></td>
          </tr>)}</tbody>
        </table>
      </div>}
      <div className="flex items-center justify-between mt-4 border-t border-line pt-3">
        <span className="text-xs text-muted">Showing {history.length} of {historyTotal} changes</span>
        <div className="flex items-center gap-2">
          <button type="button" disabled={historyLoading || historyPage <= 1} onClick={() => setHistoryPage(page => page - 1)} className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-line text-sm disabled:opacity-40"><ChevronLeft size={14} />Previous</button>
          <button type="button" disabled={historyLoading || historyPage >= historyPages} onClick={() => setHistoryPage(page => page + 1)} className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-line text-sm disabled:opacity-40">Next<ChevronRight size={14} /></button>
        </div>
      </div>
    </Panel>
  </div>;
}

import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { Panel } from '../components/Panel';
const defaults = [['Critical', 4], ['High', 8], ['Medium', 24], ['Low', 72]];
export default function SlaPolicies() {
  const { token } = useAuth();
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    let active = true;
    api.slaPolicies(token).then(rows => { if (active) setPolicies(defaults.map(([severity, hours]) => {
      const saved = rows.find(row => row.severity === severity);
      return { severity, response_hours: saved?.response_hours ?? hours, enabled: Boolean(saved?.enabled) };
    })); }).catch(err => { if (active) setError(err.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);
  function change(index, key, value) { setNotice(''); setPolicies(rows => rows.map((row, i) => i === index ? { ...row, [key]: value } : row)); }
  async function save(e) {
    e.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      await api.saveSlaPolicies(token, policies.map(row => ({ ...row, response_hours: Number(row.response_hours) })));
      setNotice('SLA policies saved. Existing case deadlines are unchanged.');
    } catch (err) { setError(err.message); } finally { setBusy(false); }
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
          <button className="bg-cyan text-ink rounded px-4 py-2 font-semibold" type="submit">{busy ? 'Saving…' : 'Save SLA policies'}</button>
        </fieldset>
      </form>
    </Panel>}
  </div>;
}

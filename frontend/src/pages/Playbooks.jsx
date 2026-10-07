import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { Panel } from '../components/Panel';
const field = 'w-full bg-panel2 border border-line rounded px-3 py-2 text-sm text-paper';
const blank = { name: '', description: '', steps: '', active: true };
const starters = {
  Phishing: ['Preserve the original message and headers', 'Review links and attachments safely', 'Identify affected accounts and users', 'Record containment actions and findings'],
  Malware: ['Preserve available evidence', 'Identify affected hosts and indicators', 'Record containment actions', 'Verify recovery and document findings'],
};
export default function Playbooks() {
  const { token } = useAuth();
  const [templates, setTemplates] = useState([]);
  const [draft, setDraft] = useState(blank);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    let active = true;
    api.playbooks(token).then(data => { if (active) setTemplates(data); })
      .catch(err => { if (active) setError(err.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);
  const change = (key, value) => setDraft(current => ({ ...current, [key]: value }));
  async function save(event) {
    event.preventDefault();
    setSaving(true); setError(''); setNotice('');
    try {
      const body = { ...draft, steps: draft.steps.split('\n').map(step => step.trim()).filter(Boolean) };
      const saved = editing ? await api.editPlaybook(token, editing, body) : await api.createPlaybook(token, body);
      setTemplates(current => [...current.filter(template => template.id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name)));
      setDraft(blank); setEditing(null); setNotice('Playbook saved. Existing case checklists are unchanged.');
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  }
  return <div className="space-y-5 max-w-5xl">
    <h1 className="text-xl font-semibold">Incident playbooks</h1>
    <p className="text-sm text-muted">Create reusable checklists for investigations. Each case keeps its own copy when a playbook is attached.</p>
    {error && <p role="alert" className="text-thread">{error}</p>}
    {notice && <p role="status" className="text-cyan text-sm">{notice}</p>}
    <Panel title={editing ? 'Edit template' : 'New template'}>
      <form onSubmit={save} className="space-y-4">
        <fieldset disabled={saving} className="space-y-4">
          {!editing && <div className="flex flex-wrap gap-2 items-center text-sm"><span className="text-muted">Start with:</span>{Object.entries(starters).map(([name, steps]) => <button key={name} type="button" className="border border-line rounded px-3 py-1" onClick={() => setDraft({ name, description: '', steps: steps.join('\n'), active: true })}>{name}</button>)}</div>}
          <label className="block text-sm">Template name<input required maxLength={120} className={field} value={draft.name} onChange={e => change('name', e.target.value)} /></label>
          <label className="block text-sm">Description<textarea maxLength={2000} className={field} value={draft.description} onChange={e => change('description', e.target.value)} /></label>
          <label className="block text-sm">Steps (one per line)<textarea required rows={7} className={field} value={draft.steps} onChange={e => change('steps', e.target.value)} /></label>
          <p className="text-xs text-muted">1–50 steps, up to 500 characters each. Steps appear in this order.</p>
          <label className="flex gap-2 items-center text-sm"><input type="checkbox" checked={draft.active} onChange={e => change('active', e.target.checked)} />Available for new cases</label>
          <div className="flex gap-3"><button className="bg-cyan text-onaccent rounded px-4 py-2 text-sm font-semibold" type="submit">{saving ? 'Saving…' : 'Save playbook'}</button>
          {editing && <button type="button" onClick={() => { setDraft(blank); setEditing(null); }}>Cancel edit</button>}</div>
        </fieldset>
      </form>
    </Panel>
    <Panel title="Templates">
      {loading ? <p role="status">Loading playbooks…</p> : templates.length === 0 ? <p className="text-muted text-sm">No templates yet. Create your first playbook above.</p> :
      <div className="space-y-4">{templates.map(template => <article key={template.id} className="border border-line rounded p-4 space-y-2">
        <div className="flex gap-3 justify-between items-start"><h2 className="font-semibold break-words min-w-0">{template.name}</h2><button disabled={saving} className="text-cyan shrink-0" aria-label={`Edit ${template.name}`} onClick={() => { setEditing(template.id); setDraft({ ...template, active: Boolean(template.active), steps: template.steps.join('\n') }); setNotice(''); }}>Edit</button></div>
        <p className="text-xs text-muted">{template.active ? 'Available' : 'Inactive'} · {template.steps.length} steps</p>
        {template.description && <p className="text-sm text-muted whitespace-pre-wrap break-words">{template.description}</p>}
        <ol className="list-decimal pl-5 text-sm space-y-1">{template.steps.map((step, index) => <li className="break-words" key={index}>{step}</li>)}</ol>
      </article>)}</div>}
    </Panel>
  </div>;
}

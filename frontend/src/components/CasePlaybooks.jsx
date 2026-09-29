import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { Panel } from './Panel';
export default function CasePlaybooks({ caseId, readOnly, onChange }) {
  const { token, user } = useAuth();
  const admin = user.role === 'SOC_ADMIN';
  const [playbooks, setPlaybooks] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [users, setUsers] = useState([]);
  const [selected, setSelected] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([api.casePlaybooks(token, caseId), api.playbooks(token), admin ? api.listUsers(token) : Promise.resolve([])])
      .then(([attached, available, people]) => { if (active) { setPlaybooks(attached); setTemplates(available); setUsers(people); } })
      .catch(err => { if (active) setError(err.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token, caseId, admin]);
  async function mutate(action) {
    setBusy(true); setError('');
    try { setPlaybooks(await action()); setSelected(''); onChange(); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  const available = templates.filter(template => template.active && !playbooks.some(playbook => playbook.template_id === template.id));
  return <Panel title="Incident playbooks">
    {error && <p role="alert" className="text-thread text-sm mb-3">{error}</p>}
    {loading ? <p role="status">Loading playbooks…</p> : <div className="space-y-4">
      {readOnly ? <p className="text-muted text-sm">Playbooks are read-only while this case is completed, rejected or archived.</p> : available.length > 0 ?
        <form className="flex flex-wrap gap-2" onSubmit={e => { e.preventDefault(); if (selected) mutate(() => api.attachPlaybook(token, caseId, Number(selected))); }}>
          <select aria-label="Playbook template" className="min-w-0 max-w-full bg-panel2 border border-line rounded p-2 text-sm" value={selected} disabled={busy} onChange={e => setSelected(e.target.value)}>
            <option value="">Choose a playbook</option>{available.map(template => <option key={template.id} value={template.id}>{template.name}</option>)}
          </select><button disabled={busy || !selected} className="bg-cyan text-ink rounded px-3 py-2 text-sm disabled:opacity-50">Attach playbook</button>
        </form> : <p className="text-muted text-sm">{playbooks.length ? 'All available templates are attached.' : 'No playbook templates available. Ask an admin to create one.'}</p>}
      {!playbooks.length && <p className="text-sm text-muted">No playbooks attached to this case.</p>}
      {playbooks.map(playbook => {
        const completed = playbook.tasks.filter(task => task.completed_at).length;
        return <section key={playbook.id} className="border border-line rounded p-3 space-y-3">
          <h4 className="font-semibold break-words">{playbook.name}</h4>
          <p className="text-xs text-muted">{completed} of {playbook.tasks.length} tasks completed</p>
          <progress aria-label={`${playbook.name} progress`} className="w-full h-2" value={completed} max={playbook.tasks.length} />
          {playbook.description && <p className="text-sm text-muted whitespace-pre-wrap break-words">{playbook.description}</p>}
          <ol className="space-y-3">{playbook.tasks.map(task => <li key={task.id} className="border-t border-line pt-3 space-y-2">
            <label className="flex gap-3 items-start text-sm"><input type="checkbox" className="mt-1" checked={Boolean(task.completed_at)} disabled={busy || readOnly} onChange={e => mutate(() => api.updatePlaybookTask(token, caseId, task.id, { completed: e.target.checked }))} /><span className={`min-w-0 break-words ${task.completed_at ? 'line-through text-muted' : ''}`}>{task.title}</span></label>
            {admin && !readOnly ? <select aria-label={`Owner for ${task.title}`} className="bg-panel2 border border-line rounded p-2 text-xs max-w-full" disabled={busy} value={task.assigned_to || ''} onChange={e => mutate(() => api.updatePlaybookTask(token, caseId, task.id, { assigned_to: e.target.value ? Number(e.target.value) : null }))}>
              <option value="">Unassigned</option>
              {task.assigned_to && !users.some(person => person.id === task.assigned_to) && <option value={task.assigned_to}>{task.assignee} (inactive)</option>}
              {users.map(person => <option key={person.id} value={person.id}>{person.username}</option>)}
            </select> : <p className="text-xs text-muted">Owner: {task.assignee || 'Unassigned'}</p>}
            {task.completed_at && <p className="text-xs text-muted">Completed by {task.completed_by_username} · {new Date(task.completed_at).toLocaleString()}</p>}
          </li>)}</ol>
        </section>;
      })}
    </div>}
  </Panel>;
}

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { Files, Clock, PlayCircle, CheckCircle2, ArrowUpRight, Plus, AlertTriangle } from 'lucide-react';
import { Panel, StatCard } from '../components/Panel';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const RANGES = [['all', 'All time'], ['7d', 'Last 7 days'], ['30d', 'Last 30 days'], ['90d', 'Last 90 days'], ['ytd', 'This year']];
function rangeToDates(key) {
  if (key === 'all') return {};
  const to = new Date(), from = new Date();
  if (key === 'ytd') from.setMonth(0, 1);
  else from.setDate(to.getDate() - Number.parseInt(key, 10));
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return <div className="bg-panel border border-line rounded-lg shadow-lg px-4 py-3 text-xs"><p className="text-muted mb-1">{label}</p><strong>{payload[0].value} incidents</strong></div>;
}
function DeadlineQueue({ title, count, cases, to, overdue }) {
  return <Panel title={title} right={<Link to={to} className="flex items-center gap-1 text-xs font-semibold">View all <ArrowUpRight size={14} /></Link>}>
    <div className="flex gap-3 items-baseline pb-5 mb-1 border-b border-line"><strong className={`text-4xl font-display tracking-tight ${overdue && count ? 'text-thread' : ''}`}>{count}</strong><span className="text-xs text-muted">cases {overdue ? 'need attention' : 'due in the next 24 hours'}</span></div>
    {cases.length ? cases.map(item => <Link key={item.id} to={`/cases/${item.id}`} className="group flex items-center gap-3 py-4 border-b border-line last:border-0">
      <span className={`w-2 h-2 rounded-full shrink-0 ${overdue ? 'bg-thread' : 'bg-amber'}`} />
      <span className="min-w-0 flex-1"><span className="block text-sm font-medium truncate">{item.title}</span><span className="block text-xs text-faint mt-1">#{item.id} · {item.assignee || 'Unassigned'} · {new Date(item.due_at).toLocaleString()}</span></span><ArrowUpRight size={16} className="shrink-0 text-faint group-hover:text-paper" />
    </Link>) : <div className="py-7 flex items-center gap-3 text-sm text-muted"><CheckCircle2 size={20} className="text-faint" />{overdue ? 'No overdue cases. You’re on track.' : 'No deadlines in the next 24 hours.'}</div>}
  </Panel>;
}
export default function Dashboard() {
  const { token, user } = useAuth();
  const [stats, setStats] = useState(null), [error, setError] = useState(''), [range, setRange] = useState('all');
  useEffect(() => {
    let active = true;
    const load = () => api.stats(token, rangeToDates(range)).then(data => { if (active) { setStats(data); setError(''); } }).catch(e => { if (active) setError(e.message); });
    load(); const timer = setInterval(load, 60000);
    return () => { active = false; clearInterval(timer); };
  }, [token, range]);
  if (error) return <div role="alert" className="nib-card text-thread">{error}</div>;
  if (!stats) return <div role="status" className="nib-card text-muted">Loading dashboard…</div>;
  const trend = stats.trend.map(t => ({ month: MONTHS[Number(t.month) - 1] || t.month, incidents: t.c }));
  const severity = stats.severity.map(s => ({ name: s.severity, count: s.c }));
  const maxAttack = Math.max(1, ...stats.attackTypes.map(a => a.c));
  const overdue = stats.deadlines?.overdue || 0;
  return <div className="space-y-6 lg:space-y-8">
    <div className="flex flex-wrap justify-between items-end gap-4">
      <div><p className="eyebrow text-faint mb-3">Response workspace / {user?.username}</p><h1 className="text-4xl sm:text-5xl font-bold">Overview</h1><p className="text-sm text-muted mt-3">Your incidents. Your priorities. Your next move.</p></div>
      <label className="text-xs text-muted flex items-center gap-3">Reporting period<select aria-label="Reporting period" value={range} onChange={e => setRange(e.target.value)} className="bg-panel border border-line px-3 text-paper text-xs">{RANGES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    </div>
    <section className="dashboard-hero rounded-xl p-6 sm:p-8 flex flex-wrap items-center justify-between gap-6">
      <div className="max-w-xl"><p className="eyebrow text-white/50 mb-3">Focus for today</p><h2 className="text-2xl sm:text-3xl font-bold">{overdue ? `${overdue} response ${overdue === 1 ? 'deadline needs' : 'deadlines need'} attention.` : 'Make the next move count.'}</h2><p className="text-sm text-white/60 mt-3">{overdue ? 'Review overdue investigations and coordinate the next response.' : 'Keep investigations moving, from the first signal to resolution.'}</p></div>
      <div className="flex flex-wrap gap-3"><Link to={overdue ? '/cases?due=overdue' : '/cases?mine=1'} className="rounded-lg border border-white/25 px-4 py-3 text-sm font-medium flex items-center gap-2">{overdue ? <AlertTriangle size={16} /> : <Files size={16} />}{overdue ? 'Review overdue' : 'My cases'}</Link><Link to="/incidents/new" className="rounded-lg bg-white text-[#20211f] px-4 py-3 text-sm font-semibold flex items-center gap-2"><Plus size={16} />Create incident</Link></div>
    </section>
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
      {[['Total cases', stats.total, Files], ['Under review', stats.byStatus['Under Review'], Clock], ['In progress', stats.byStatus['In Progress'], PlayCircle], ['Closed', stats.byStatus.Completed, CheckCircle2]].map(([label, value, icon]) => <StatCard key={label} label={label} value={value} icon={icon} />)}
    </div>
    <div className="grid lg:grid-cols-3 gap-4">
      <Panel title="Incident activity" className="lg:col-span-2" right={<span className="eyebrow text-faint">Monthly volume</span>}>
        <div className="h-64">{trend.length ? <ResponsiveContainer width="100%" height="100%"><AreaChart data={trend} margin={{ left: -20, right: 12, top: 15 }}><defs><linearGradient id="incidentFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="rgb(var(--paper))" stopOpacity={.2} /><stop offset="100%" stopColor="rgb(var(--paper))" stopOpacity={.01} /></linearGradient></defs><CartesianGrid stroke="rgb(var(--line))" vertical={false} /><XAxis dataKey="month" tick={{ fill: 'rgb(var(--faint))', fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis allowDecimals={false} tick={{ fill: 'rgb(var(--faint))', fontSize: 11 }} axisLine={false} tickLine={false} /><Tooltip content={<ChartTooltip />} /><Area type="monotone" dataKey="incidents" stroke="rgb(var(--paper))" strokeWidth={2.5} fill="url(#incidentFill)" /></AreaChart></ResponsiveContainer> : <div className="h-full flex items-center justify-center text-sm text-faint">Incident trends appear as cases are created.</div>}</div>
      </Panel>
      <Panel title="Severity breakdown" right={<span className="eyebrow text-faint">Case volume</span>}><div className="h-64">{severity.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={severity} margin={{ left: -25, right: 8, top: 15 }}><CartesianGrid stroke="rgb(var(--line))" vertical={false} /><XAxis dataKey="name" tick={{ fill: 'rgb(var(--faint))', fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis allowDecimals={false} tick={{ fill: 'rgb(var(--faint))', fontSize: 11 }} axisLine={false} tickLine={false} /><Tooltip content={<ChartTooltip />} /><Bar dataKey="count" fill="rgb(var(--muted))" radius={[3, 3, 0, 0]} barSize={28} /></BarChart></ResponsiveContainer> : <div className="h-full flex items-center justify-center text-sm text-faint">No severity data yet.</div>}</div></Panel>
    </div>
    <div><div className="flex items-center gap-3 mb-4"><h2 className="font-bold text-xl">Response priorities</h2><div className="h-px bg-line flex-1" /></div><div className="grid lg:grid-cols-2 gap-4"><DeadlineQueue title="Overdue deadlines" count={overdue} cases={stats.deadlines?.overdueCases || []} to="/cases?due=overdue" overdue /><DeadlineQueue title="Coming up next" count={stats.deadlines?.upcoming || 0} cases={stats.deadlines?.upcomingCases || []} to="/cases?due=upcoming" /></div></div>
    <div className="grid lg:grid-cols-2 gap-4"><Panel title="Attack types">{stats.attackTypes.length ? <div className="space-y-5">{stats.attackTypes.map(a => <div key={a.attack_type}><div className="flex justify-between text-xs mb-2"><span>{a.attack_type}</span><span className="text-faint tabular-nums">{a.c}</span></div><div className="h-1.5 rounded-full bg-panel2"><div className="h-full rounded-full bg-muted" style={{ width: `${a.c / maxAttack * 100}%` }} /></div></div>)}</div> : <p className="text-sm text-faint">No attack types recorded.</p>}</Panel><Panel title="Attack origins">{stats.origins.length ? <div className="space-y-4">{stats.origins.map((o, i) => <div key={o.country} className="flex items-center gap-4 border-b border-line pb-3 last:border-0"><span className="text-xs text-faint tabular-nums">{String(i + 1).padStart(2, '0')}</span><div className="flex-1 min-w-0"><span className="text-sm font-medium">{o.country}</span><span className="block text-xs text-faint mt-1">{o.attacks} attacks</span></div><span className="font-display font-bold text-lg">{o.pct}%</span></div>)}</div> : <p className="text-sm text-faint">No origins recorded.</p>}</Panel></div>
  </div>;
}

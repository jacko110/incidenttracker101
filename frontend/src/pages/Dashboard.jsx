import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar,
} from "recharts";
import { Files, Clock, PlayCircle, CheckCircle2, ChevronDown, Filter as FilterIcon } from "lucide-react";
import { Panel, StatCard } from "../components/Panel";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";
import { STATUS_COLOR } from "../components/StatusPill";

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ORIGIN_COLORS = ["#D8B574", "#A5B4FC", "#E58C91", "#89B8A0", "#A4A9B5"];
const ATTACK_COLORS = ["#A5B4FC", "#E58C91", "#D8B574", "#89B8A0", "#A4A9B5", "#E58C91"];
const RANGE_OPTIONS = [
  { key: "all", label: "All Time" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "90d", label: "Last 90 days" },
  { key: "ytd", label: "This year" },
];

function rangeToDates(key) {
  if (key === "all") return {};
  const to = new Date();
  const from = new Date();
  if (key === "7d") from.setDate(to.getDate() - 7);
  else if (key === "30d") from.setDate(to.getDate() - 30);
  else if (key === "90d") from.setDate(to.getDate() - 90);
  else if (key === "ytd") from.setMonth(0, 1);
  const fmt = (d) => d.toISOString().slice(0, 10);
  return { from: fmt(from), to: fmt(to) };
}

function CustomTooltip({ active, payload, label }) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-panel2 border border-line rounded px-3 py-2 font-mono text-[11px] text-paper">
        <div className="text-muted mb-1">{label}</div>
        <div>{payload[0].value} incidents</div>
      </div>
    );
  }
  return null;
}

export default function Dashboard() {
  const { token } = useAuth();
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");
  const [range, setRange] = useState("all");
  const [rangeOpen, setRangeOpen] = useState(false);

  useEffect(() => {
    let active = true;
    const load = () => api.stats(token, rangeToDates(range))
      .then((data) => { if (active) { setStats(data); setError(""); } })
      .catch((e) => { if (active) setError(e.message); });
    load();
    const timer = setInterval(load, 60_000);
    return () => { active = false; clearInterval(timer); };
  }, [token, range]);

  if (error) return <div className="text-thread text-sm p-4 font-mono">{error}</div>;
  if (!stats) return <div className="text-muted text-sm p-4 font-mono">Loading dashboard...</div>;

  const trendData = stats.trend.map((t) => ({
    month: MONTH_NAMES[parseInt(t.month, 10) - 1] || t.month,
    incidents: t.c,
  }));

  const severity = stats.severity.length ? stats.severity : [{ severity: "N/A", c: 0 }];
  const severityData = severity.map((s) => ({ name: s.severity, count: s.c }));

  const maxAttack = Math.max(1, ...stats.attackTypes.map((a) => a.c));

  const statCards = [
    { label: "Total cases", value: stats.total, icon: Files, color: "#A4A9B5" },
    { label: "Under review", value: stats.byStatus["Under Review"], icon: Clock, color: STATUS_COLOR["Under Review"] },
    { label: "In progress", value: stats.byStatus["In Progress"], icon: PlayCircle, color: STATUS_COLOR["In Progress"] },
    { label: "Closed", value: stats.byStatus["Completed"], icon: CheckCircle2, color: STATUS_COLOR["Completed"] },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div><p className="text-sm text-muted mb-2">Your security workspace</p><h1 className="text-3xl font-semibold tracking-tight">Overview</h1><p className="text-sm text-muted mt-2">A clear view of your incidents, priorities, and response activity.</p></div>
        <Link to="/incidents/new" className="bg-cyan text-ink font-semibold text-sm px-5 py-3 rounded-xl hover:brightness-110">Create incident</Link>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <FilterIcon size={14} className="text-faint" />
        <span className="text-muted font-body text-xs font-medium">Reporting period</span>
        <div className="relative">
          <button
            onClick={() => setRangeOpen((o) => !o)}
            className="ml-1 flex items-center gap-1 bg-panel2 border border-line px-2.5 py-1 rounded hover:border-linestrong transition-colors text-paper"
          >
            {RANGE_OPTIONS.find((r) => r.key === range)?.label} <ChevronDown size={12} />
          </button>
          {rangeOpen && (
            <div className="absolute left-0 mt-1 w-40 bg-panel2 border border-line rounded-xl shadow-xl z-50 overflow-hidden">
              {RANGE_OPTIONS.map((r) => (
                <button
                  key={r.key}
                  onClick={() => {
                    setRange(r.key);
                    setRangeOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-line transition-colors ${
                    range === r.key ? "text-amber" : "text-muted"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {statCards.map((c) => (
          <StatCard key={c.label} {...c} />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title={`Overdue response deadlines (${stats.deadlines?.overdue ?? 0})`} right={<Link to="/cases?due=overdue" className="text-xs text-cyan hover:underline">View all</Link>}>
          {(stats.deadlines?.overdueCases || []).length ? (
            <div className="space-y-2">
              {stats.deadlines.overdueCases.map((item) => (
                <Link key={item.id} to={`/cases/${item.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-panel2/50 px-4 py-3 hover:bg-line">
                  <span className="min-w-0"><span className="block text-sm text-paper truncate">#{item.id} · {item.title}</span><span className="text-[11px] text-faint">{item.assignee || "Unassigned"} · {item.status}</span></span>
                  <span className="shrink-0 text-xs text-thread">{new Date(item.due_at).toLocaleString()}</span>
                </Link>
              ))}
            </div>
          ) : <p className="text-sm text-faint">No overdue cases.</p>}
        </Panel>
        <Panel title={`Due within 24 hours (${stats.deadlines?.upcoming ?? 0})`} right={<Link to="/cases?due=upcoming" className="text-xs text-cyan hover:underline">View all</Link>}>
          {(stats.deadlines?.upcomingCases || []).length ? (
            <div className="space-y-2">
              {stats.deadlines.upcomingCases.map((item) => (
                <Link key={item.id} to={`/cases/${item.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-panel2/50 px-4 py-3 hover:bg-line">
                  <span className="min-w-0"><span className="block text-sm text-paper truncate">#{item.id} · {item.title}</span><span className="text-[11px] text-faint">{item.assignee || "Unassigned"} · {item.status}</span></span>
                  <span className="shrink-0 text-xs text-amber">{new Date(item.due_at).toLocaleString()}</span>
                </Link>
              ))}
            </div>
          ) : <p className="text-sm text-faint">No deadlines in the next 24 hours.</p>}
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Panel
          title="Incident trends"
          right={<span className="text-xs text-muted">Monthly totals</span>}
        >
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData} margin={{ left: -20, right: 10 }}>
                <CartesianGrid stroke="#30323A" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: "#A4A9B5", fontSize: 10, fontFamily: "IBM Plex Mono" }} axisLine={{ stroke: "#30323A" }} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fill: "#A4A9B5", fontSize: 10, fontFamily: "IBM Plex Mono" }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Line type="monotone" dataKey="incidents" stroke="#A5B4FC" strokeWidth={3} dot={{ r: 3, fill: "#A5B4FC" }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Severity distribution">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={severityData} margin={{ left: -20, right: 10 }}>
                <CartesianGrid stroke="#30323A" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: "#A4A9B5", fontSize: 10, fontFamily: "IBM Plex Mono" }} axisLine={{ stroke: "#30323A" }} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fill: "#A4A9B5", fontSize: 10, fontFamily: "IBM Plex Mono" }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" fill="#A5B4FC" radius={[6, 6, 0, 0]} barSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Attack types">
          <div className="space-y-3 py-1">
            {stats.attackTypes.map((a, i) => (
              <div key={a.attack_type} className="flex items-center gap-3 text-[11px]">
                <span className="w-32 text-muted text-right shrink-0 leading-tight">{a.attack_type}</span>
                <div className="flex-1 h-1.5 bg-panel2 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${(a.c / maxAttack) * 100}%`, backgroundColor: ATTACK_COLORS[i % ATTACK_COLORS.length] }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Panel title="Top attack origins" className="lg:col-span-3">
          <div className="space-y-4 overflow-y-auto">
            {stats.origins.map((o, i) => {
              const color = ORIGIN_COLORS[i % ORIGIN_COLORS.length];
              return (
                <div key={o.country}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-paper">{o.country}</span>
                    <span className="font-mono text-[11px] text-muted">{o.pct}%</span>
                  </div>
                  <div className="font-mono text-[10px] text-faint mt-0.5">{o.attacks} attacks</div>
                  <div className="h-1.5 bg-panel2 rounded-full overflow-hidden mt-2">
                    <div className="h-full rounded-full" style={{ width: `${o.pct}%`, backgroundColor: color }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      </div>
    </div>
  );
}

import React, { useEffect, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar,
} from "recharts";
import { Files, Clock, PlayCircle, CheckCircle2, ChevronDown, Filter as FilterIcon, Maximize2, Radio } from "lucide-react";
import { Panel, StatCard } from "../components/Panel";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";
import { STATUS_COLOR } from "../components/StatusPill";

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ORIGIN_COLORS = ["#D9A244", "#4A93A8", "#C1443A", "#5C9068", "#8B8981"];
const ATTACK_COLORS = ["#4A93A8", "#C1443A", "#D9A244", "#5C9068", "#8B8981", "#C1443A"];
const SEMAPHORE_CELLS = 24;

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

// Turns the real byStatus counts into a proportional row of status-light
// cells, like a console health board — not decorative, this is the actual
// status mix of every open case, just rendered at a glance.
function buildSemaphoreCells(byStatus) {
  const total = Object.values(byStatus).reduce((a, b) => a + b, 0);
  if (!total) return Array(SEMAPHORE_CELLS).fill(null);

  const cells = [];
  for (const [status, count] of Object.entries(byStatus)) {
    const n = Math.round((count / total) * SEMAPHORE_CELLS);
    for (let i = 0; i < n; i++) cells.push(STATUS_COLOR[status]);
  }
  while (cells.length < SEMAPHORE_CELLS) cells.push(null);
  return cells.slice(0, SEMAPHORE_CELLS);
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

function WorldMap() {
  return (
    <svg viewBox="0 0 800 380" className="w-full h-full">
      <g fill="#2C2E36">
        <path d="M60 90 L150 70 L200 110 L180 160 L120 180 L70 150 Z" />
        <path d="M150 200 L200 190 L220 260 L180 300 L150 260 Z" />
        <path d="M360 90 L430 80 L460 130 L420 170 L370 150 Z" />
        <path d="M370 170 L430 170 L450 260 L400 290 L360 240 Z" />
      </g>
      <path d="M430 60 L650 50 L700 110 L620 160 L470 140 Z" fill="#4A93A8" opacity="0.7" />
      <path d="M520 110 L620 105 L640 150 L560 170 L520 150 Z" fill="#C1443A" opacity="0.85" />
      <path d="M60 90 L150 70 L200 110 L180 160 L120 180 L70 150 Z" fill="#D9A244" opacity="0.75" />
      <circle cx="580" cy="130" r="4" fill="#D9A244" />
      <circle cx="120" cy="120" r="4" fill="#4A93A8" />
      <circle cx="400" cy="220" r="4" fill="#5C9068" />
    </svg>
  );
}

export default function Dashboard() {
  const { token } = useAuth();
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");
  const [range, setRange] = useState("all");
  const [rangeOpen, setRangeOpen] = useState(false);

  useEffect(() => {
    api.stats(token, rangeToDates(range)).then(setStats).catch((e) => setError(e.message));
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
  const semaphoreCells = buildSemaphoreCells(stats.byStatus);

  const statCards = [
    { label: "Total cases", value: stats.total, delta: "30d", icon: Files, color: "#8B8981" },
    { label: "Under review", value: stats.byStatus["Under Review"], delta: "30d", icon: Clock, color: STATUS_COLOR["Under Review"] },
    { label: "In progress", value: stats.byStatus["In Progress"], delta: "30d", icon: PlayCircle, color: STATUS_COLOR["In Progress"] },
    { label: "Closed", value: stats.byStatus["Completed"], delta: "30d", icon: CheckCircle2, color: STATUS_COLOR["Completed"] },
  ];

  return (
    <div className="space-y-5">
      <div className="bg-panel border border-line rounded-md px-4 py-3 flex items-center gap-2 text-sm">
        <FilterIcon size={14} className="text-faint" />
        <span className="text-muted font-mono text-[11px] uppercase tracking-widest">filter:</span>
        <div className="relative">
          <button
            onClick={() => setRangeOpen((o) => !o)}
            className="ml-1 flex items-center gap-1 bg-panel2 border border-line px-2.5 py-1 rounded hover:border-linestrong transition-colors text-paper"
          >
            {RANGE_OPTIONS.find((r) => r.key === range)?.label} <ChevronDown size={12} />
          </button>
          {rangeOpen && (
            <div className="absolute left-0 mt-1 w-40 bg-panel2 border border-line rounded-md shadow-xl z-50 overflow-hidden">
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

      {/* Status semaphore strip — a live proportional readout of every open
          case's status, not decoration. */}
      <div className="bg-panel border border-line rounded-md px-4 py-3 flex items-center gap-3 overflow-x-auto">
        <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-faint shrink-0">
          <Radio size={12} /> status board
        </span>
        <div className="flex gap-1">
          {semaphoreCells.map((color, i) => (
            <div
              key={i}
              className="w-3.5 h-3.5 rounded-sm shrink-0"
              style={{ backgroundColor: color || "#22242B" }}
            />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((c) => (
          <StatCard key={c.label} {...c} />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Panel
          title="Incident trends"
          right={
            <button className="font-mono text-[10px] uppercase tracking-widest flex items-center gap-1 bg-panel2 border border-line px-2 py-1 rounded text-muted">
              monthly <ChevronDown size={12} />
            </button>
          }
        >
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData} margin={{ left: -20, right: 10 }}>
                <CartesianGrid stroke="#2C2E36" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: "#8B8981", fontSize: 10, fontFamily: "IBM Plex Mono" }} axisLine={{ stroke: "#2C2E36" }} tickLine={false} />
                <YAxis tick={{ fill: "#8B8981", fontSize: 10, fontFamily: "IBM Plex Mono" }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Line type="monotone" dataKey="incidents" stroke="#D9A244" strokeWidth={2} dot={{ r: 3, fill: "#D9A244" }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Severity distribution">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={severityData} margin={{ left: -20, right: 10 }}>
                <CartesianGrid stroke="#2C2E36" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: "#8B8981", fontSize: 10, fontFamily: "IBM Plex Mono" }} axisLine={{ stroke: "#2C2E36" }} tickLine={false} />
                <YAxis tick={{ fill: "#8B8981", fontSize: 10, fontFamily: "IBM Plex Mono" }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" fill="#4A93A8" radius={[2, 2, 0, 0]} barSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Attack types" right={<Maximize2 size={14} className="text-faint" />}>
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
        <Panel title="Attack origin map" className="lg:col-span-2 h-72">
          <div className="flex-1">
            <WorldMap />
          </div>
        </Panel>

        <Panel title="Top attack origins" className="h-72">
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
                    <div className="h-full rounded-full" style={{ width: `${o.pct * 2}%`, backgroundColor: color }} />
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

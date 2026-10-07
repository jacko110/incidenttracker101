import React, { useState } from "react";
import { NavLink, Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard, FileWarning, LayoutGrid, ChevronUp, ChevronDown,
  Clock, PlayCircle, CheckCircle2, AlertTriangle, XCircle, Archive, MessageCircle,
  LogOut, UserCheck, Users as UsersIcon, Search,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { roleLabel, canManageUsers } from "../permissions";
import { STATUS_COLOR } from "./StatusPill";

const caseList = [
  { icon: LayoutGrid, label: "All cases", status: null, color: "#A4A9B5" },
  { icon: Clock, label: "Under review", status: "Under Review", color: STATUS_COLOR["Under Review"] },
  { icon: PlayCircle, label: "In progress", status: "In Progress", color: STATUS_COLOR["In Progress"] },
  { icon: CheckCircle2, label: "Completed", status: "Completed", color: STATUS_COLOR["Completed"] },
  { icon: AlertTriangle, label: "Attempt", status: "Attempt", color: STATUS_COLOR["Attempt"] },
  { icon: XCircle, label: "Rejected", status: "Rejected", color: STATUS_COLOR["Rejected"] },
];

export default function Sidebar({ open, counts }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const isCaseActive = (status) => location.pathname === "/cases" && params.get("mine") !== "1" && !params.has("due") && (params.get("status") || null) === status;
  const [caseListOpen, setCaseListOpen] = useState(true);
  const initials = (user?.username || "?").slice(0, 2).toUpperCase();

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 md:static bg-[#191B20] border-r border-line flex flex-col shrink-0 transition-all duration-200 ${
        open ? "w-[248px]" : "w-0 overflow-hidden"
      }`}
    >
      <div className="px-6 pt-7 pb-6 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-cyan/10 border border-cyan/20 flex items-center justify-center text-cyan font-semibold text-lg">N</div>
        <div><div className="text-xl font-semibold tracking-tight">Nib<span className="text-faint text-xs font-normal ml-2">workspace</span></div><div className="text-xs text-faint mt-0.5">Incident management</div></div>
      </div>

      <div className="mx-4 mb-4 flex items-center gap-3 bg-panel border border-line rounded-xl px-3 py-3">
        <div className="w-8 h-8 rounded-full bg-ink border border-line flex items-center justify-center text-xs font-semibold text-cyan">
          {initials}
        </div>
        <div className="leading-tight min-w-0">
          <div className="text-sm text-paper font-medium truncate">{user?.username || "Guest"}</div>
          <div className="text-xs text-muted">{roleLabel(user?.role) || ""}</div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 text-sm">
        <div className="nav-caption !pt-1">Workspace</div>
        <SideLink to="/" icon={LayoutDashboard} label="Dashboard" end />
        <SideLink to="/incidents" icon={FileWarning} label="Incident panel" />

        <div className="mb-1">
          <button
            aria-expanded={caseListOpen}
            onClick={() => setCaseListOpen((o) => !o)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-muted hover:bg-panel2 hover:text-paper transition-colors"
          >
            <LayoutGrid size={16} />
            <span className="flex-1 text-left">Case list</span>
            {caseListOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {caseListOpen && (
            <div className="ml-1 border-l border-line pl-3">
              {caseList.map((item) => (
                <Link
                  key={item.label}
                  to={item.status ? `/cases?status=${encodeURIComponent(item.status)}` : "/cases"}
                  aria-current={isCaseActive(item.status) ? "page" : undefined}
                  className={
                    `w-full flex items-center gap-3 px-2 py-1.5 rounded text-[13px] transition-colors ${
                      isCaseActive(item.status) ? "text-cyan bg-cyan/10" : "text-muted hover:bg-panel2 hover:text-paper"
                    }`
                  }
                >
                  <item.icon size={14} />
                  <span className="flex-1 text-left truncate">{item.label}</span>
                  <span
                    className="font-mono text-[10px] rounded-full px-1.5 py-0.5"
                    style={{ backgroundColor: "#ffffff06", color: "#A4A9B5" }}
                  >
                    {item.status ? counts?.byStatus?.[item.status] ?? 0 : counts?.total ?? 0}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="nav-caption">Your workload</div>
        <SideLink to="/cases?mine=1" icon={UserCheck} label="My cases" />
        <SideLink to="/cases?due=overdue" icon={AlertTriangle} label="Overdue" />
        <SideLink to="/cases?due=upcoming" icon={Clock} label="Due soon" />
        <div className="nav-caption">Investigation</div>
        <SideLink to="/iocs" icon={Search} label="Search IOCs" />
        <SideLink to="/archive" icon={Archive} label="Archive" />
        <SideLink to="/chat" icon={MessageCircle} label="Chat" />
        {canManageUsers(user?.role) && <div className="nav-caption">Administration</div>}
        {canManageUsers(user?.role) && <SideLink to="/sla" icon={Clock} label="SLA policies" />}
        {canManageUsers(user?.role) && <SideLink to="/playbooks" icon={CheckCircle2} label="Playbooks" />}
        {canManageUsers(user?.role) && (
          <SideLink to="/users" icon={UsersIcon} label="User management" />
        )}
      </nav>

      <div className="px-3 py-4 border-t border-line">
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-faint hover:bg-panel2 hover:text-muted text-left transition-colors"
        >
          <LogOut size={16} />
          <span>Log out</span>
        </button>
      </div>
    </aside>
  );
}

function SideLink({ to, icon: Icon, label, end }) {
  const location = useLocation();
  if (to.startsWith("/cases?")) {
    const params = new URLSearchParams(location.search);
    const target = new URLSearchParams(to.split("?")[1]);
    const key = [...target.keys()][0];
    const active = location.pathname === "/cases" && params.get(key) === target.get(key);
    return <Link to={to} aria-current={active ? "page" : undefined}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg mb-0.5 text-left transition-colors border-l-2 ${active ? "bg-cyan/10 text-cyan border-transparent" : "text-muted hover:bg-panel2 hover:text-paper border-transparent"}`}>
      <Icon size={16} /><span className="flex-1 truncate">{label}</span>
    </Link>;
  }
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `w-full flex items-center gap-3 px-3 py-2.5 rounded-lg mb-0.5 text-left transition-colors border-l-2 ${
          isActive
            ? "bg-cyan/10 text-cyan border-transparent"
            : "text-muted hover:bg-panel2 hover:text-paper border-transparent"
        }`
      }
    >
      <Icon size={16} />
      <span className="flex-1 truncate">{label}</span>
    </NavLink>
  );
}

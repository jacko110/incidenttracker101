import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Bell, Menu } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";

function useUtcClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const hh = String(now.getUTCHours()).padStart(2, "0");
  const mm = String(now.getUTCMinutes()).padStart(2, "0");
  const ss = String(now.getUTCSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss} utc`;
}

export default function Topbar({ onToggleSidebar, crumb }) {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const clock = useUtcClock();
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef(null);
  const initials = (user?.username || "?").slice(0, 2).toUpperCase();

  function load() {
    api.notifications(token).then((res) => {
      setNotifications(res.notifications);
      setUnread(res.unread);
    }).catch(() => {});
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, [token]);

  useEffect(() => {
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  async function handleOpen() {
    setOpen((o) => !o);
    if (unread > 0) {
      await api.markAllNotificationsRead(token).catch(() => {});
      setUnread(0);
    }
  }

  function goToCase(n) {
    setOpen(false);
    if (n.case_id) navigate(`/cases/${n.case_id}`);
  }

  return (
    <header className="h-[72px] border-b border-line flex items-center justify-between px-3 md:px-6 shrink-0 bg-ink/95">
      <div className="flex items-center gap-3 font-body text-xs font-medium">
        <button aria-label="Toggle navigation" onClick={onToggleSidebar} className="text-muted hover:text-paper mr-1 transition-colors">
          <Menu size={17} />
        </button>
        <span className="hidden sm:inline text-faint">Workspace /</span>
        <span className="text-paper normal-case tracking-normal font-body text-sm">{crumb}</span>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden md:flex items-center gap-2 bg-panel border border-line rounded-xl px-3 py-1.5 w-64">
          <Search size={13} className="text-faint" />
          <form onSubmit={(event) => {
            event.preventDefault();
            const query = search.trim();
            if (!query) return;
            navigate(`/cases?q=${encodeURIComponent(query)}`);
          }} className="w-full">
            <input
              aria-label="Search cases"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search cases"
              className="bg-transparent outline-none text-sm text-paper placeholder:text-faint w-full font-body"
            />
          </form>
        </div>

        <span className="hidden lg:inline font-mono text-[11px] tracking-widest text-faint">{clock}</span>

        <div className="relative" ref={ref}>
          <button
            aria-label="Notifications"
            onClick={handleOpen}
            className="relative w-8 h-8 rounded flex items-center justify-center text-muted hover:bg-panel2 hover:text-paper transition-colors"
          >
            <Bell size={16} />
            {unread > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-thread text-paper text-[9px] flex items-center justify-center font-mono">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </button>

          {open && (
            <div className="absolute right-0 mt-2 w-72 max-w-[calc(100vw-2rem)] bg-panel border border-line rounded-xl shadow-xl z-50 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-line font-display text-sm text-paper font-semibold tracking-wide">
                Notifications
              </div>
              <div className="max-h-80 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="text-faint text-sm py-8 text-center">You're all caught up.</div>
                ) : (
                  notifications.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => goToCase(n)}
                      className="w-full text-left px-4 py-2.5 hover:bg-panel2 border-b border-line last:border-0 transition-colors"
                    >
                      <div className="text-sm text-paper">{n.message}</div>
                      <div className="font-mono text-[10px] text-faint mt-1">
                        {n.created_at?.slice(0, 16).replace("T", " ")}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <button
          aria-label="My profile"
          onClick={() => navigate("/profile")}
          className="w-8 h-8 rounded-full bg-panel2 border border-line hover:border-amber flex items-center justify-center transition-colors font-mono text-[11px] text-cyan"
        >
          {initials}
        </button>
      </div>
    </header>
  );
}

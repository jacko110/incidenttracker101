import React, { useEffect, useState, lazy, Suspense } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import Topbar from "./components/Topbar";
const Login = lazy(() => import("./pages/Login"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const IncidentPanel = lazy(() => import("./pages/IncidentPanel"));
const CreateIncident = lazy(() => import("./pages/CreateIncident"));
const CaseList = lazy(() => import("./pages/CaseList"));
const CaseDetail = lazy(() => import("./pages/CaseDetail"));
const Archive = lazy(() => import("./pages/Archive"));
const Chat = lazy(() => import("./pages/Chat"));
const Users = lazy(() => import("./pages/Users"));
const IocSearch = lazy(() => import("./pages/IocSearch"));
const SlaPolicies = lazy(() => import("./pages/SlaPolicies"));
const Playbooks = lazy(() => import("./pages/Playbooks"));
const Profile = lazy(() => import("./pages/Profile"));
import { useAuth } from "./context/AuthContext";
import { api } from "./api";
import { canManageUsers } from "./permissions";

function RequireAuth({ children }) {
  const { token, user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div role="status">Loading session…</div>;
  if (!token || !user) return <Navigate to="/login" state={{ from: location }} replace />;
  return children;
}

function RequireAdmin({ children }) {
  const { user } = useAuth();
  if (!canManageUsers(user?.role)) return <Navigate to="/" replace />;
  return children;
}

const CRUMBS = {
  "/": "Dashboard",
  "/incidents": "Incident Panel",
  "/incidents/new": "Add New Incident",
  "/cases": "Case List",
  "/archive": "Archive",
  "/chat": "Chat",
  "/users": "User Management",
  "/iocs": "Search IOCs",
  "/profile": "My Profile",
  "/playbooks": "Playbooks",
  "/sla": "SLA policies",
};

function Layout({ children }) {
  const { token } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(() => window.matchMedia("(min-width: 768px)").matches);
  const [counts, setCounts] = useState(null);
  const location = useLocation();

  useEffect(() => {
    if (token) api.stats(token).then(setCounts).catch(() => {});
  }, [token, location.pathname]);

  useEffect(() => {
    if (!window.matchMedia("(min-width: 768px)").matches) setSidebarOpen(false);
  }, [location.pathname, location.search]);
  useEffect(() => {
    const close = (event) => { if (event.key === "Escape") setSidebarOpen(false); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);

  const crumb =
    location.pathname.startsWith("/cases/")
      ? "Case Detail"
      : CRUMBS[location.pathname] || "Dashboard";

  return (
    <div className="w-full h-screen bg-ink text-paper flex font-body overflow-hidden">
      {sidebarOpen && <button aria-label="Close navigation" onClick={() => setSidebarOpen(false)} className="fixed inset-0 bg-black/50 z-30 md:hidden" />}
      <Sidebar open={sidebarOpen} counts={counts} />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar onToggleSidebar={() => setSidebarOpen((o) => !o)} crumb={crumb} />
        <main className="flex-1 overflow-y-auto p-6 lg:p-8"><div className="max-w-[1600px] mx-auto"><Suspense fallback={<div role="status">Loading page…</div>}>{children}</Suspense></div></main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<div role="status" className="p-6">Loading page…</div>}>
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/*"
        element={
          <RequireAuth>
            <Layout>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/incidents" element={<IncidentPanel />} />
                <Route path="/incidents/new" element={<CreateIncident />} />
                <Route path="/cases" element={<CaseList />} />
                <Route path="/cases/:id" element={<CaseDetail />} />
                <Route path="/archive" element={<Archive />} />
                <Route path="/chat" element={<Chat />} />
                <Route path="/iocs" element={<IocSearch />} />
                <Route path="/sla" element={<RequireAdmin><SlaPolicies /></RequireAdmin>} />
                <Route path="/playbooks" element={<RequireAdmin><Playbooks /></RequireAdmin>} />
                <Route path="/profile" element={<Profile />} />
                <Route
                  path="/users"
                  element={
                    <RequireAdmin>
                      <Users />
                    </RequireAdmin>
                  }
                />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Layout>
          </RequireAuth>
        }
      />
    </Routes>
    </Suspense>
  );
}

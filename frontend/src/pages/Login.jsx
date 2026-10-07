import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Shield, ArrowUpRight, Check } from 'lucide-react';

const SHOW_DEMO = import.meta.env.DEV && import.meta.env.VITE_SHOW_DEMO === "true";
const DEMO_USERS = [
  { username: "zemenu", role: "SOC Analyst" },
  { username: "admin", role: "SOC Admin" },
  { username: "iranalyst", role: "IR Analyst" },
];

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(username, password);
      const from = location.state?.from;
      const dest = from ? `${from.pathname}${from.search || ""}${from.hash || ""}` : "/";
      navigate(dest, { replace: true });
    } catch (err) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-shell min-h-screen w-full grid lg:grid-cols-2">
      <section className="login-story hidden lg:flex flex-col justify-between p-12 xl:p-16 text-white">
        <div className="flex items-center gap-3"><Shield size={27} /><span className="font-display text-3xl font-bold">Nib.</span><span className="ml-auto eyebrow text-white/50">Incident management</span></div>
        <div className="max-w-lg py-16"><p className="eyebrow text-white/50 mb-6">Clarity under pressure</p><h2 className="text-6xl xl:text-7xl font-bold leading-[1.04]">Every incident.<br />A clear<br />next move.</h2><p className="text-white/60 text-lg leading-relaxed mt-7 max-w-sm">One workspace to investigate, coordinate, and bring your response into focus.</p>
          <div className="mt-10 space-y-4 text-sm text-white/80">{['Track the full investigation', 'Keep response deadlines in view', 'Coordinate your team’s next steps'].map(text => <div key={text} className="flex gap-3 items-center"><Check size={16} />{text}</div>)}</div></div>
        <div className="border-t border-white/20 pt-5 flex justify-between text-xs text-white/50"><span>Built for your response team</span><ArrowUpRight size={16} /></div>
      </section>
      <div className="flex items-center justify-center px-6 py-12 sm:px-12">
      <div className="w-full max-w-[400px]">
        <div className="font-display text-3xl font-bold mb-16 lg:hidden">Nib.</div>
        <p className="eyebrow text-faint mb-4">Your workspace awaits</p>

        <h1 className="text-4xl sm:text-5xl font-bold mb-4">Welcome back.</h1>
        <p className="text-sm text-muted mb-9">Sign in to continue your investigations.</p>
        <form
          onSubmit={handleSubmit}
          className="space-y-6"
        >
          <div>
            <label className="font-body text-xs font-medium text-muted mb-1.5 block">Username</label>
            <input
              aria-label="Username" autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-panel border border-line rounded px-4 py-3 text-sm text-paper outline-none focus:border-cyan transition-colors"
            />
          </div>
          <div>
            <label className="font-body text-xs font-medium text-muted mb-1.5 block">Password</label>
            <input
              type="password" aria-label="Password" autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-panel border border-line rounded px-4 py-3 text-sm text-paper outline-none focus:border-cyan transition-colors"
            />
          </div>

          {error && <div className="font-mono text-xs text-thread">{error}</div>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-cyan hover:brightness-110 transition-all text-onaccent text-sm font-semibold rounded-lg py-3.5 disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>

          {SHOW_DEMO && <div className="pt-3 border-t border-line">
            <p className="font-mono text-[10px] text-faint text-center mb-2 tracking-wide">
              demo accounts (password123 for all)
            </p>
            <div className="flex gap-2">
              {DEMO_USERS.map((u) => (
                <button
                  key={u.username}
                  type="button"
                  onClick={() => {
                    setUsername(u.username);
                    setPassword("password123");
                  }}
                  className="flex-1 text-[11px] bg-panel2 hover:bg-line border border-line rounded py-1.5 px-1 transition-colors"
                >
                  <div className="text-paper font-medium">{u.username}</div>
                  <div className="text-faint font-mono text-[10px] mt-0.5">{u.role}</div>
                </button>
              ))}
            </div>
          </div>}
        </form>
        <p className="mt-10 pt-6 border-t border-line text-xs text-faint">Access is managed by your workspace administrator.</p>
      </div>
      </div>
    </div>
  );
}

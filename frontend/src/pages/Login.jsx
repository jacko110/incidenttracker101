import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

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
    <div className="min-h-screen w-full bg-ink flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="font-stamp text-2xl text-paper">
            NI<span className="text-thread">B</span>
          </div>
          <div className="font-mono text-[10px] tracking-widest uppercase text-faint mt-1.5">
            Incident tracking system
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-panel border border-line rounded-md p-6 space-y-4"
        >
          <div>
            <label className="font-mono text-[10px] uppercase tracking-widest text-muted mb-1.5 block">Username</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-panel2 border border-line rounded px-3 py-2 text-sm text-paper outline-none focus:border-amber transition-colors"
            />
          </div>
          <div>
            <label className="font-mono text-[10px] uppercase tracking-widest text-muted mb-1.5 block">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-panel2 border border-line rounded px-3 py-2 text-sm text-paper outline-none focus:border-amber transition-colors"
            />
          </div>

          {error && <div className="font-mono text-xs text-thread">{error}</div>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-cyan hover:brightness-110 transition-all text-ink text-sm font-semibold rounded py-2 disabled:opacity-50"
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
      </div>
    </div>
  );
}

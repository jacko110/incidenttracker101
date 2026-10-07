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
    <div className="login-shell min-h-screen w-full flex items-center justify-center px-4">
      <div className="w-full max-w-[440px]">
        <div className="text-center mb-8">
          <div className="font-display text-3xl font-semibold tracking-tight text-paper">
            Nib<span className="text-cyan">.</span>
          </div>
          <div className="font-body text-xs font-medium text-faint mt-1.5">
            Your incident workspace
          </div>
        </div>

        <h1 className="text-2xl font-semibold text-center mb-2">Welcome back</h1>
        <p className="text-sm text-muted text-center mb-7">Sign in to continue your investigations.</p>
        <form
          onSubmit={handleSubmit}
          className="bg-panel border border-line rounded-2xl p-7 sm:p-9 space-y-5"
        >
          <div>
            <label className="font-body text-xs font-medium text-muted mb-1.5 block">Username</label>
            <input
              aria-label="Username" autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-panel2 border border-line rounded px-3 py-2 text-sm text-paper outline-none focus:border-cyan transition-colors"
            />
          </div>
          <div>
            <label className="font-body text-xs font-medium text-muted mb-1.5 block">Password</label>
            <input
              type="password" aria-label="Password" autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-panel2 border border-line rounded px-3 py-2 text-sm text-paper outline-none focus:border-cyan transition-colors"
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

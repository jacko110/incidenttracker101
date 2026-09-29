import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { api, SESSION_INVALID } from "../api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => sessionStorage.getItem("nib_token"));
  const [user, setUser] = useState(() => {
    const raw = sessionStorage.getItem("nib_user");
    try { return raw ? JSON.parse(raw) : null; } catch { return null; }
  });

  const [loading, setLoading] = useState(() => Boolean(sessionStorage.getItem("nib_token")));

  const login = useCallback(async (username, password) => {
    const data = await api.login(username, password);
    setToken(data.token);
    setUser(data.user);
    sessionStorage.setItem("nib_token", data.token);
    sessionStorage.setItem("nib_user", JSON.stringify(data.user));
    return data;
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    sessionStorage.removeItem("nib_token");
    sessionStorage.removeItem("nib_user");
  }, []);

  useEffect(() => {
    const invalidate = (event) => {
      if (event.detail.token === token) logout();
    };
    window.addEventListener(SESSION_INVALID, invalidate);
    return () => window.removeEventListener(SESSION_INVALID, invalidate);
  }, [token, logout]);

  useEffect(() => {
    let cancelled = false;
    if (!token) { setLoading(false); return; }
    const refresh = () => api.me(token).then(({ user: current }) => {
      if (!cancelled) {
        setUser(current);
        sessionStorage.setItem("nib_user", JSON.stringify(current));
      }
    }).catch(() => {}).finally(() => { if (!cancelled) setLoading(false); });
    refresh();
    window.addEventListener("focus", refresh);
    return () => { cancelled = true; window.removeEventListener("focus", refresh); };
  }, [token]);

  // Merges partial updates (e.g. from PATCH /auth/me) into the current user
  // and keeps sessionStorage in sync, so a refresh doesn't lose the change.
  const updateUser = useCallback((partial) => {
    setUser((prev) => {
      const next = { ...prev, ...partial };
      sessionStorage.setItem("nib_user", JSON.stringify(next));
      return next;
    });
  }, []);

  return (
    <AuthContext.Provider value={{ token, user, loading, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

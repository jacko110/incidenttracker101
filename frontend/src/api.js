const BASE = "/api";
export const SESSION_INVALID = "nib:session-invalid";
function checkSession(res, data, token) {
  if (token && (res.status === 401 || data.code === "ACCOUNT_DEACTIVATED")) {
    window.dispatchEvent(new CustomEvent(SESSION_INVALID, { detail: { token } }));
  }
}

async function request(path, { method = "GET", body, token } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  checkSession(res, data, token);
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

export const api = {
  login: (username, password) =>
    request("/auth/login", { method: "POST", body: { username, password } }),
  me: (token) => request("/auth/me", { token }),
  updateMe: (token, body) => request("/auth/me", { method: "PATCH", body, token }),

  stats: (token, { from, to } = {}) => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const qs = params.toString();
    return request(`/cases/stats${qs ? `?${qs}` : ""}`, { token });
  },

  // Returns { data, pagination: { page, pageSize, total, totalPages } }
  cases: (token, { status, archived, assignedToMe, q, due, page, pageSize } = {}) => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (archived) params.set("archived", "1");
    if (assignedToMe) params.set("assignedToMe", "1");
    if (q) params.set("q", q);
    if (due) params.set("due", due);
    if (page) params.set("page", page);
    if (pageSize) params.set("pageSize", pageSize);
    const qs = params.toString();
    return request(`/cases${qs ? `?${qs}` : ""}`, { token });
  },

  allCases: async (token, filters = {}) => {
    const first = await api.cases(token, { ...filters, page: 1, pageSize: 100 });
    const rows = [...first.data];
    for (let page = 2; page <= first.pagination.totalPages; page++) {
      const next = await api.cases(token, { ...filters, page, pageSize: 100 });
      rows.push(...next.data);
    }
    return { data: rows };
  },

  caseDetail: (token, id) => request(`/cases/${id}`, { token }),
  createCase: (token, body) => request("/cases", { method: "POST", body, token }),
  updateCase: (token, id, body) =>
    request(`/cases/${id}`, { method: "PATCH", body, token }),
  editCase: (token, id, body) =>
    request(`/cases/${id}`, { method: "PUT", body, token }),
  rejectCase: (token, id, reason) =>
    request(`/cases/${id}/reject`, { method: "POST", body: { reason }, token }),
  assignCase: (token, id, userId) =>
    request(`/cases/${id}/assign`, { method: "POST", body: { userId }, token }),
  addNote: (token, id, body) =>
    request(`/cases/${id}/notes`, { method: "POST", body: { body }, token }),
  listUsers: (token) => request("/cases/lookup/users", { token }),

  linkCase: (token, id, targetCaseId, note) =>
    request(`/cases/${id}/links`, { method: "POST", body: { targetCaseId, note }, token }),
  unlinkCase: (token, id, linkId) =>
    request(`/cases/${id}/links/${linkId}`, { method: "DELETE", token }),

  // Admin-only user management (distinct from the lightweight lookup above,
  // which only returns active users' id/username/role for assignment)
  users: (token) => request("/users", { token }),
  createUser: (token, body) => request("/users", { method: "POST", body, token }),
  updateUser: (token, id, body) => request(`/users/${id}`, { method: "PATCH", body, token }),
  emailLog: (token) => request("/users/email-log", { token }),

  // Cross-case IOC search
  searchIocs: (token, { q, type, page, pageSize } = {}) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (type) params.set("type", type);
    if (page) params.set("page", page);
    if (pageSize) params.set("pageSize", pageSize);
    const qs = params.toString();
    return request(`/iocs${qs ? `?${qs}` : ""}`, { token });
  },
  iocTypes: (token) => request("/iocs/types", { token }),

  chatList: (token) => request("/chat", { token }),
  chatSend: (token, body) => request("/chat", { method: "POST", body: { body }, token }),

  notifications: (token) => request("/notifications", { token }),
  markNotificationRead: (token, id) =>
    request(`/notifications/${id}/read`, { method: "POST", token }),
  markAllNotificationsRead: (token) =>
    request("/notifications/read-all", { method: "POST", token }),

  uploadFiles: async (token, files) => {
    const form = new FormData();
    for (const file of files) form.append("files", file);
    const res = await fetch(`${BASE}/uploads`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const data = await res.json().catch(() => ({}));
    checkSession(res, data, token);
    if (!res.ok) throw new Error(data.error || "Upload failed");
    return data.files; // [{ originalName, storedName, url, size, mimetype }]
  },

  // File URLs returned by uploadFiles/case detail are auth-gated
  // (/api/uploads/file/:name) — this appends the token as a query param so
  // <img src>/<a href> can load them without a custom header.
  fileUrl: (token, url) => {
    if (!url) return url;
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}token=${encodeURIComponent(token)}`;
  },
};

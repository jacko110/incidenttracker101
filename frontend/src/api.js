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
  slaPolicies: (token) => request('/sla', { token }),
  slaPolicyHistory: (token, { severity, page, pageSize } = {}) => {
    const params = new URLSearchParams();
    if (severity) params.set('severity', severity);
    if (page) params.set('page', page);
    if (pageSize) params.set('pageSize', pageSize);
    const query = params.toString();
    return request('/sla/history' + (query ? '?' + query : ''), { token });
  },
  exportSlaHistory: async (token, severity) => {
    const params = new URLSearchParams();
    if (severity) params.set('severity', severity);
    const query = params.toString();
    const res = await fetch(`${BASE}/sla/history/export${query ? `?${query}` : ''}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      checkSession(res, data, token);
      throw new Error(data.error || 'CSV export failed');
    }
    return res.blob();
  },
  saveSlaPolicies: (token, policies) => request('/sla', { token, method: 'PUT', body: { policies } }),
  applySla: (token, id) => request(`/cases/${id}/sla`, { token, method: 'POST' }),
  playbooks: (token) => request('/playbooks', { token }),
  createPlaybook: (token, body) => request('/playbooks', { token, method: 'POST', body }),
  editPlaybook: (token, id, body) => request(`/playbooks/${id}`, { token, method: 'PUT', body }),
  casePlaybooks: (token, id) => request(`/cases/${id}/playbooks`, { token }),
  attachPlaybook: (token, id, templateId) => request(`/cases/${id}/playbooks`, { token, method: 'POST', body: { templateId } }),
  updatePlaybookTask: (token, id, taskId, body) => request(`/cases/${id}/playbooks/tasks/${taskId}`, { token, method: 'PATCH', body }),
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
  exportCaseReport: async (token, id) => {
    const res = await fetch(`${BASE}/cases/${id}/report`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      checkSession(res, data, token);
      throw new Error(data.error || 'Report export failed');
    }
    return res.blob();
  },
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
  caseActivity: (token, filters = {}) => {
    const params = new URLSearchParams();
    for (const key of ['from', 'to', 'action', 'q', 'page', 'pageSize']) {
      if (filters[key]) params.set(key, filters[key]);
    }
    const query = params.toString();
    return request(`/audit/history${query ? `?${query}` : ''}`, { token });
  },
  exportCaseActivity: async (token, filters = {}) => {
    const params = new URLSearchParams();
    for (const key of ['from', 'to', 'action', 'q']) {
      if (filters[key]) params.set(key, filters[key]);
    }
    const query = params.toString();
    const res = await fetch(`${BASE}/audit/history/export${query ? `?${query}` : ''}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      checkSession(res, data, token);
      throw new Error(data.error || 'Activity export failed');
    }
    return res.blob();
  },

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
    if (typeof url !== 'string' || !/^\/api\/uploads\/file\/[^/?#]+$/.test(url)) return '';
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}token=${encodeURIComponent(token)}`;
  },
};

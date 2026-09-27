// Mirrors the backend's role checks (see backend/middleware/auth.js and
// backend/routes/cases.js) so the UI can hide/disable actions a user can't
// perform. The backend is still the source of truth — these are UX hints,
// not the actual security boundary.

export function canReject(role) {
  return role === "SOC_ADMIN" || role === "IR_ANALYST";
}

export function canArchive(role) {
  return role === "SOC_ADMIN";
}

export function canAssign(role) {
  return role === "SOC_ADMIN";
}

export function canManageUsers(role) {
  return role === "SOC_ADMIN";
}

export function roleLabel(role) {
  return { SOC_ANALYST: "SOC Analyst", SOC_ADMIN: "SOC Admin", IR_ANALYST: "IR Analyst" }[role] || role;
}

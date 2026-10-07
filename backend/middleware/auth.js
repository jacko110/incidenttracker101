const jwt = require("jsonwebtoken");
const db = require("../db");
const { SECRET } = require("../config");

// Decodes the JWT and re-checks the user is still active in the DB, so
// deactivating someone mid-session locks them out immediately rather than
// waiting for their token to expire (up to 8h otherwise).
function verifyAndAttachUser(token, req) {
  const payload = jwt.verify(token, SECRET, { algorithms: ['HS256'] });
  if (!Number.isSafeInteger(payload.id) || payload.id < 1) throw new Error('Invalid token subject');
  const dbUser = db.prepare("SELECT id, username, role, active, auth_version FROM users WHERE id = ?").get(payload.id);
  if (!dbUser || dbUser.active === 0) {
    const err = new Error("Account deactivated");
    err.deactivated = true;
    throw err;
  }
  if ((payload.auth_version ?? 0) !== dbUser.auth_version) throw new Error('Session revoked');
  req.user = dbUser;
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing token" });
  try {
    verifyAndAttachUser(token, req);
    next();
  } catch (e) {
    if (e.deactivated) return res.status(403).json({ error: "This account has been deactivated", code: "ACCOUNT_DEACTIVATED" });
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

// requireRole('SOC_ADMIN', 'IR_ANALYST') -> 403s anyone whose role isn't listed.
// Must run after requireAuth (needs req.user).
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Missing token" });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: `This action requires one of these roles: ${roles.join(", ")}`,
      });
    }
    next();
  };
}

// Same as requireAuth, but also accepts ?token=... in the query string.
// Needed for <img src> / <a href> file links, which can't send an
// Authorization header. Only use this on read-only, low-risk GET routes.
function requireAuthFromHeaderOrQuery(req, res, next) {
  const header = req.headers.authorization || "";
  const headerToken = header.startsWith("Bearer ") ? header.slice(7) : null;
  const token = headerToken || req.query.token;
  if (!token) return res.status(401).json({ error: "Missing token" });
  try {
    verifyAndAttachUser(token, req);
    next();
  } catch (e) {
    if (e.deactivated) return res.status(403).json({ error: "This account has been deactivated", code: "ACCOUNT_DEACTIVATED" });
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

module.exports = { requireAuth, requireRole, requireAuthFromHeaderOrQuery, SECRET };

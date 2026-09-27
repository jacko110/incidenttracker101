// Lightweight in-memory rate limiter for login attempts. Keyed by IP+username
// so one bad actor guessing one account doesn't lock out everyone on the
// same NAT/office IP, and one attacker spraying usernames from one IP still
// gets throttled per attempt.
//
// This resets on server restart and doesn't share state across instances —
// fine for a single-process demo, not sufficient for a multi-instance
// production deployment (use Redis-backed limiting there instead).

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 5;

const attempts = new Map(); // key -> { count, firstAttemptAt }

function keyFor(req) {
  const ip = req.ip || req.connection?.remoteAddress || "unknown";
  const username = (req.body?.username || "").toLowerCase();
  return `${ip}:${username}`;
}

function loginRateLimit(req, res, next) {
  const key = keyFor(req);
  const now = Date.now();
  const entry = attempts.get(key);

  if (entry && now - entry.firstAttemptAt > WINDOW_MS) {
    attempts.delete(key);
  }

  const current = attempts.get(key);
  if (current && current.count >= MAX_ATTEMPTS) {
    const retryAfterMs = WINDOW_MS - (now - current.firstAttemptAt);
    res.set("Retry-After", Math.ceil(retryAfterMs / 1000));
    return res.status(429).json({
      error: `Too many login attempts. Try again in ${Math.ceil(retryAfterMs / 60000)} minute(s).`,
    });
  }

  next();
}

// Call this only when a login attempt actually fails (wrong password/username).
// Successful logins should call clearAttempts() instead.
function recordFailedAttempt(req) {
  const key = keyFor(req);
  const now = Date.now();
  const current = attempts.get(key);
  if (current && now - current.firstAttemptAt <= WINDOW_MS) {
    current.count += 1;
  } else {
    attempts.set(key, { count: 1, firstAttemptAt: now });
  }
}

function clearAttempts(req) {
  attempts.delete(keyFor(req));
}

module.exports = { loginRateLimit, recordFailedAttempt, clearAttempts };

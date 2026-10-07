// Bounded single-process limiter: account guesses and username spraying.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const MAX_IP_REQUESTS = 60;
const MAX_KEYS = 10000;
const attempts = new Map();
const ipRequests = new Map();
function ipFor(req) { return req.ip || req.socket?.remoteAddress || 'unknown'; }
function keyFor(req) { return `${ipFor(req)}:${typeof req.body?.username === 'string' ? req.body.username.toLowerCase().slice(0, 100) : ''}`; }
function expire(map, now) { for (const [key, value] of map) if (now - value.firstAttemptAt >= WINDOW_MS) map.delete(key); }
function blocked(res, entry, now) {
  const seconds = Math.max(1, Math.ceil((WINDOW_MS - (now - entry.firstAttemptAt)) / 1000));
  res.set('Retry-After', seconds);
  return res.status(429).json({ error: `Too many login attempts. Try again in ${Math.ceil(seconds / 60)} minute(s).` });
}
function loginRateLimit(req, res, next) {
  const now = Date.now();
  expire(attempts, now); expire(ipRequests, now);
  const key = keyFor(req), ip = ipFor(req);
  const account = attempts.get(key), current = ipRequests.get(ip);
  if (account?.count >= MAX_ATTEMPTS) return blocked(res, account, now);
  if (current?.count >= MAX_IP_REQUESTS) return blocked(res, current, now);
  if ((!current && ipRequests.size >= MAX_KEYS) || (!account && attempts.size >= MAX_KEYS)) {
    res.set('Retry-After', 60); return res.status(429).json({ error: 'Login temporarily busy. Try again shortly.' });
  }
  ipRequests.set(ip, { count: (current?.count || 0) + 1, firstAttemptAt: current?.firstAttemptAt || now });
  next();
}
function recordFailedAttempt(req) {
  const key = keyFor(req), now = Date.now(), current = attempts.get(key);
  attempts.set(key, { count: (current?.count || 0) + 1, firstAttemptAt: current?.firstAttemptAt || now });
}
function clearAttempts(req) { attempts.delete(keyFor(req)); }
module.exports = { loginRateLimit, recordFailedAttempt, clearAttempts };

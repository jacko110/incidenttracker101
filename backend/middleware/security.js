const helmet = require('helmet');
const cors = require('cors');
const crypto = require('node:crypto');
const { production } = require('../config');

function configureSecurity(app) {
  app.disable('x-powered-by');
  // Trust only explicitly configured proxy addresses/subnets, never every client.
  if (process.env.TRUST_PROXY) app.set('trust proxy', process.env.TRUST_PROXY.split(',').map(value => value.trim()));
  app.use(helmet({
    contentSecurityPolicy: production ? { directives: {
      defaultSrc: ["'self'"], scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'], imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'"], objectSrc: ["'none'"], frameAncestors: ["'none'"],
      formAction: ["'self'"], baseUri: ["'self'"],
    } } : false,
    strictTransportSecurity: production ? { maxAge: 31536000 } : false,
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: 'no-referrer' },
  }));
  const origins = (process.env.CORS_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);
  // The production frontend is served by this API; cross-origin access is opt-in.
  app.use(cors({ origin: production ? origins : true }));
  app.use((req, res, next) => {
    req.requestId = crypto.randomUUID();
    res.setHeader('X-Request-ID', req.requestId);
    if (req.path.startsWith('/api')) res.setHeader('Cache-Control', 'no-store');
    if (production) {
      const started = Date.now();
      res.on('finish', () => console.log(JSON.stringify({ event: 'request', requestId: req.requestId, method: req.method, path: req.path, status: res.statusCode, durationMs: Date.now() - started })));
    }
    next();
  });
}
function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  const status = error.type === 'entity.too.large' ? 413 : error.type === 'entity.parse.failed' ? 400 : 500;
  if (status === 500) console.error(JSON.stringify({ event: 'request_error', requestId: req.requestId, message: error.message }));
  res.status(status).json({ error: status === 413 ? 'Request body is too large' : status === 400 ? 'Invalid JSON request body' : 'Internal server error', requestId: req.requestId });
}
module.exports = { configureSecurity, errorHandler };

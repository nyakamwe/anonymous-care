// JWT-based auth. Tokens carry only the internal user id + role, never PII,
// keeping patient identity anonymous end to end.
const jwt = require('jsonwebtoken');

// In production, load this from an environment variable / secret manager.
const SECRET = process.env.JWT_SECRET || 'dev-only-change-me';

function sign(user) {
  return jwt.sign({ uid: user.id, role: user.role, handle: user.anon_handle },
    SECRET, { expiresIn: '12h' });
}

function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'authentication required' });
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: 'invalid or expired session' });
  }
}

// Restrict a route to one or more roles.
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'not allowed for your role' });
    }
    next();
  };
}

module.exports = { sign, authRequired, requireRole, SECRET };

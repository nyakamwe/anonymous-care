// Anonymous telehealth MVP - main entry point.
const express = require('express');
const path = require('path');

const app = express();
app.use(express.json({ limit: '256kb' }));

// Basic security headers (no external deps). Tighten CSP per your asset needs.
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; img-src 'self' data:; media-src 'self' blob:; " +
    "style-src 'self' 'unsafe-inline'; script-src 'self'");
  next();
});

// API routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/cases', require('./routes/cases'));
app.use('/api/appointments', require('./routes/appointments'));
app.use('/api/messages', require('./routes/messages'));

app.get('/api/health', (req, res) => res.json({ ok: true }));

// Static frontend
app.use(express.static(path.join(__dirname, 'public')));

// Bind to localhost only for safety in this environment.
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '127.0.0.1';

if (require.main === module) {
  app.listen(PORT, HOST, () => {
    console.log(`Telehealth MVP running at http://${HOST}:${PORT}`);
  });
}

module.exports = app;

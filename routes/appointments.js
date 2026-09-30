// Counselling appointments + a lightweight WebRTC signaling relay so patient
// and therapist can run a live video session in the browser.
const express = require('express');
const crypto = require('crypto');
const store = require('../store');
const { authRequired, requireRole } = require('../middleware/auth');

const router = express.Router();

// In-memory signaling mailbox. Fine for an MVP; production would use
// WebSockets + a TURN server.
const signals = new Map();

function canAccess(appt, uid) { return appt && (appt.patient_id === uid || appt.therapist_id === uid); }

// Patient books a session with a therapist.
router.post('/', authRequired, requireRole('patient'), (req, res) => {
  const { therapistId, scheduledAt, notes } = req.body || {};
  if (!therapistId || !scheduledAt) return res.status(400).json({ error: 'therapistId and scheduledAt are required' });
  const t = store.findOne('users', u => u.id === Number(therapistId) && u.role === 'therapist');
  if (!t) return res.status(400).json({ error: 'therapist not found' });
  const appt = store.insert('appointments', {
    patient_id: req.user.uid, therapist_id: Number(therapistId),
    scheduled_at: scheduledAt, status: 'requested',
    room_token: crypto.randomBytes(9).toString('hex'), notes: notes || null,
  });
  res.json(appt);
});

// List appointments for the caller.
router.get('/', authRequired, (req, res) => {
  const key = req.user.role === 'therapist' ? 'therapist_id' : 'patient_id';
  const rows = store.find('appointments', a => a[key] === req.user.uid).slice().sort((a, b) => b.id - a.id);
  res.json(rows);
});

// Therapist confirms / cancels / completes.
router.post('/:id/status', authRequired, requireRole('therapist'), (req, res) => {
  const id = Number(req.params.id);
  const { status } = req.body || {};
  if (!['confirmed', 'cancelled', 'completed'].includes(status)) return res.status(400).json({ error: 'invalid status' });
  const appt = store.findOne('appointments', a => a.id === id);
  if (!appt || appt.therapist_id !== req.user.uid) return res.status(403).json({ error: 'forbidden' });
  store.update('appointments', id, { status });
  res.json({ ok: true });
});

// --- WebRTC signaling relay -------------------------------------------------
router.post('/:id/signal', authRequired, (req, res) => {
  const appt = store.findOne('appointments', a => a.id === Number(req.params.id));
  if (!canAccess(appt, req.user.uid)) return res.status(403).json({ error: 'forbidden' });
  const { kind, data } = req.body || {};
  if (!signals.has(appt.room_token)) signals.set(appt.room_token, []);
  signals.get(appt.room_token).push({ from: req.user.uid, kind, data, at: Date.now() });
  res.json({ ok: true });
});

router.get('/:id/signal', authRequired, (req, res) => {
  const appt = store.findOne('appointments', a => a.id === Number(req.params.id));
  if (!canAccess(appt, req.user.uid)) return res.status(403).json({ error: 'forbidden' });
  const since = Number(req.query.since || 0);
  const box = signals.get(appt.room_token) || [];
  const out = box.filter(m => m.from !== req.user.uid && m.at > since);
  res.json({ now: Date.now(), messages: out });
});

module.exports = router;

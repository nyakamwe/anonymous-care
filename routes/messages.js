// Secure in-thread messaging attached to a case or an appointment.
const express = require('express');
const store = require('../store');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

function assertThreadAccess(type, id, user) {
  if (type === 'case') {
    const c = store.findOne('cases', x => x.id === id);
    if (!c) return false;
    if (user.role === 'patient') return c.patient_id === user.uid;
    if (user.role === 'practitioner') return true;
    return false;
  }
  if (type === 'appointment') {
    const a = store.findOne('appointments', x => x.id === id);
    if (!a) return false;
    return a.patient_id === user.uid || a.therapist_id === user.uid;
  }
  return false;
}

router.get('/:type/:id', authRequired, (req, res) => {
  const { type } = req.params; const id = Number(req.params.id);
  if (!assertThreadAccess(type, id, req.user)) return res.status(403).json({ error: 'forbidden' });
  const rows = store.find('messages', m => m.thread_type === type && m.thread_id === id)
    .slice().sort((a, b) => a.id - b.id)
    .map(m => {
      const u = store.findOne('users', x => x.id === m.sender_id) || {};
      return Object.assign({}, m, { sender_handle: u.anon_handle, sender_role: u.role });
    });
  res.json(rows);
});

router.post('/:type/:id', authRequired, (req, res) => {
  const { type } = req.params; const id = Number(req.params.id);
  const { body } = req.body || {};
  if (!body) return res.status(400).json({ error: 'body is required' });
  if (!assertThreadAccess(type, id, req.user)) return res.status(403).json({ error: 'forbidden' });
  store.insert('messages', { thread_type: type, thread_id: id, sender_id: req.user.uid, body });
  res.json({ ok: true });
});

module.exports = router;

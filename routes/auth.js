// Anonymous account creation + login.
// Patients never provide a real name, email or phone. They register with a
// self-chosen handle (or a generated one) and a passphrase. That is the only
// link to their record, which keeps care anonymous.
const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const store = require('../store');
const { sign, authRequired } = require('../middleware/auth');

const router = express.Router();

function randomHandle() { return 'anon-' + crypto.randomBytes(4).toString('hex'); }

// POST /api/auth/register { handle?, passphrase, role, displayName?, specialty? }
router.post('/register', (req, res) => {
  let { handle, passphrase, role, displayName, specialty } = req.body || {};
  role = role || 'patient';
  if (!['patient', 'practitioner', 'therapist'].includes(role)) {
    return res.status(400).json({ error: 'invalid role' });
  }
  if (!passphrase || passphrase.length < 8) {
    return res.status(400).json({ error: 'passphrase must be at least 8 characters' });
  }
  if (!handle) handle = randomHandle();
  if (store.findOne('users', u => u.anon_handle === handle)) {
    return res.status(409).json({ error: 'handle already taken, pick another' });
  }
  const user = store.insert('users', {
    anon_handle: handle, role,
    pass_hash: bcrypt.hashSync(passphrase, 10),
    display_name: displayName || null, specialty: specialty || null,
  });
  res.json({ token: sign(user), handle: user.anon_handle, role: user.role });
});

// POST /api/auth/login { handle, passphrase }
router.post('/login', (req, res) => {
  const { handle, passphrase } = req.body || {};
  const user = store.findOne('users', u => u.anon_handle === (handle || ''));
  if (!user || !bcrypt.compareSync(passphrase || '', user.pass_hash)) {
    return res.status(401).json({ error: 'invalid handle or passphrase' });
  }
  res.json({ token: sign(user), handle: user.anon_handle, role: user.role });
});

router.get('/me', authRequired, (req, res) => {
  res.json({ uid: req.user.uid, handle: req.user.handle, role: req.user.role });
});

// List bookable therapists (auth required).
router.get('/therapists', authRequired, (req, res) => {
  const rows = store.find('users', u => u.role === 'therapist')
    .map(u => ({ id: u.id, anon_handle: u.anon_handle, display_name: u.display_name, specialty: u.specialty }));
  res.json(rows);
});

module.exports = router;

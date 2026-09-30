// Patient symptom cases + clinician review (prescribe or request in-person lab).
const express = require('express');
const store = require('../store');
const { authRequired, requireRole } = require('../middleware/auth');

const router = express.Router();

// Patient submits a new case.
router.post('/', authRequired, requireRole('patient'), (req, res) => {
  const { category, symptoms, answers } = req.body || {};
  if (!category || !symptoms) return res.status(400).json({ error: 'category and symptoms are required' });
  const c = store.insert('cases', {
    patient_id: req.user.uid, practitioner_id: null, category, symptoms,
    answers: answers ? JSON.stringify(answers) : null,
    status: 'submitted', updated_at: store.now(),
  });
  res.json(c);
});

// List cases relevant to the caller.
router.get('/', authRequired, (req, res) => {
  let rows;
  if (req.user.role === 'patient') {
    rows = store.find('cases', c => c.patient_id === req.user.uid);
  } else if (req.user.role === 'practitioner') {
    rows = store.find('cases', c => c.practitioner_id == null || c.practitioner_id === req.user.uid);
  } else {
    return res.status(403).json({ error: 'not allowed for your role' });
  }
  rows = rows.slice().sort((a, b) => b.id - a.id);
  res.json(rows);
});

// Full case detail incl. prescriptions + lab requests.
router.get('/:id', authRequired, (req, res) => {
  const id = Number(req.params.id);
  const c = store.findOne('cases', x => x.id === id);
  if (!c) return res.status(404).json({ error: 'case not found' });
  const isOwner = req.user.role === 'patient' && c.patient_id === req.user.uid;
  const isClinician = req.user.role === 'practitioner';
  if (!isOwner && !isClinician) return res.status(403).json({ error: 'forbidden' });
  const out = Object.assign({}, c);
  out.prescriptions = store.find('prescriptions', p => p.case_id === id);
  out.lab_requests = store.find('lab_requests', l => l.case_id === id);
  res.json(out);
});

// Practitioner claims a case (starts review).
router.post('/:id/claim', authRequired, requireRole('practitioner'), (req, res) => {
  const id = Number(req.params.id);
  const c = store.update('cases', id, { practitioner_id: req.user.uid, status: 'in_review', updated_at: store.now() });
  if (!c) return res.status(404).json({ error: 'case not found' });
  res.json(c);
});

// Practitioner issues a prescription (no facility visit needed).
router.post('/:id/prescribe', authRequired, requireRole('practitioner'), (req, res) => {
  const id = Number(req.params.id);
  const { medication, dosage, instructions } = req.body || {};
  if (!medication || !dosage) return res.status(400).json({ error: 'medication and dosage are required' });
  store.insert('prescriptions', { case_id: id, practitioner_id: req.user.uid, medication, dosage, instructions: instructions || null });
  store.update('cases', id, { status: 'prescribed', practitioner_id: req.user.uid, updated_at: store.now() });
  res.json({ ok: true });
});

// Practitioner requests an in-person lab test (e.g. confirm syphilis).
router.post('/:id/lab', authRequired, requireRole('practitioner'), (req, res) => {
  const id = Number(req.params.id);
  const { testName, facilityNote } = req.body || {};
  if (!testName) return res.status(400).json({ error: 'testName is required' });
  store.insert('lab_requests', { case_id: id, practitioner_id: req.user.uid, test_name: testName, facility_note: facilityNote || null, status: 'requested' });
  store.update('cases', id, { status: 'lab_requested', practitioner_id: req.user.uid, updated_at: store.now() });
  res.json({ ok: true });
});

module.exports = router;

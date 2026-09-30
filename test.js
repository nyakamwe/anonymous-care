// In-process smoke test: starts the server, exercises the core flow, exits.
const http = require('http');
const app = require('./server');

function req(server, method, path, token, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (data) headers['Content-Length'] = Buffer.byteLength(data);
    if (token) headers.Authorization = 'Bearer ' + token;
    const { port } = server.address();
    const r = http.request({ host: '127.0.0.1', port, method, path, headers }, (res) => {
      let out = '';
      res.on('data', c => out += c);
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(out || '{}') }); } catch (e) { resolve({ status: res.statusCode, body: out }); } });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

(async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  const assert = (cond, msg) => { if (!cond) { console.error('FAIL:', msg); process.exit(1); } else console.log('ok  -', msg); };

  let r = await req(server, 'GET', '/api/health');
  assert(r.body.ok, 'health');

  r = await req(server, 'POST', '/api/auth/register', null, { role: 'patient', passphrase: 'secret123' });
  assert(r.body.token && r.body.handle.startsWith('anon-'), 'patient anonymous register (handle=' + r.body.handle + ')');
  const patient = r.body.token;

  r = await req(server, 'POST', '/api/auth/register', null, { role: 'practitioner', handle: 'dr-smith', passphrase: 'docpass12', displayName: 'Dr Smith', specialty: 'Sexual health' });
  assert(r.body.token, 'practitioner register');
  const doc = r.body.token;

  r = await req(server, 'POST', '/api/auth/register', null, { role: 'therapist', handle: 'ther-jones', passphrase: 'therpass12', displayName: 'J. Jones', specialty: 'Counselling' });
  const therapistId = 3; const therapist = r.body.token;
  assert(r.body.token, 'therapist register');

  r = await req(server, 'POST', '/api/cases', patient, { category: 'sexual-health', symptoms: 'painless sore, rash on palms' });
  const caseId = r.body.id;
  assert(caseId && r.body.status === 'submitted', 'patient submits case #' + caseId);

  r = await req(server, 'GET', '/api/cases', doc);
  assert(Array.isArray(r.body) && r.body.length >= 1, 'practitioner sees queue');

  r = await req(server, 'POST', '/api/cases/' + caseId + '/lab', doc, { testName: 'RPR / TPHA for syphilis', facilityNote: 'Confirmatory blood test required in person' });
  assert(r.body.ok, 'practitioner requests in-person lab test');

  r = await req(server, 'POST', '/api/cases/' + caseId + '/prescribe', doc, { medication: 'Benzathine penicillin G', dosage: '2.4M units IM single', instructions: 'Return if persists' });
  assert(r.body.ok, 'practitioner prescribes medicine');

  r = await req(server, 'GET', '/api/cases/' + caseId, patient);
  assert(r.body.prescriptions.length === 1 && r.body.lab_requests.length === 1 && r.body.status === 'prescribed', 'patient sees prescription + lab request');

  r = await req(server, 'POST', '/api/messages/case/' + caseId, patient, { body: 'Thank you doctor' });
  assert(r.body.ok, 'patient sends secure message');
  r = await req(server, 'GET', '/api/messages/case/' + caseId, doc);
  assert(r.body.length === 1 && r.body[0].sender_role === 'patient', 'practitioner reads message thread');

  r = await req(server, 'GET', '/api/auth/therapists', patient);
  assert(r.body.length >= 1, 'patient lists therapists');

  r = await req(server, 'POST', '/api/appointments', patient, { therapistId, scheduledAt: '2026-10-05T14:00' });
  const apptId = r.body.id;
  assert(apptId && r.body.room_token, 'patient books counselling session');

  r = await req(server, 'POST', '/api/appointments/' + apptId + '/status', therapist, { status: 'confirmed' });
  assert(r.body.ok, 'therapist confirms session');

  // Signaling relay reachable by both, isolated to participants.
  r = await req(server, 'POST', '/api/appointments/' + apptId + '/signal', patient, { kind: 'offer', data: { sdp: 'x' } });
  assert(r.body.ok, 'patient posts webrtc offer');
  r = await req(server, 'GET', '/api/appointments/' + apptId + '/signal?since=0', therapist);
  assert(r.body.messages.length === 1 && r.body.messages[0].kind === 'offer', 'therapist receives offer via signaling relay');

  // Access control: a second patient must not read the first case.
  r = await req(server, 'POST', '/api/auth/register', null, { role: 'patient', passphrase: 'other12345' });
  const other = r.body.token;
  r = await req(server, 'GET', '/api/cases/' + caseId, other);
  assert(r.status === 403, 'unrelated patient blocked from foreign case');

  console.log('\nAll smoke tests passed.');
  server.close();
  process.exit(0);
})();

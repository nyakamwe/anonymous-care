// AnonCare frontend (vanilla JS). CSP-safe: no inline handlers.
const state = { token: null, role: null, handle: null, currentAppt: null };
const $ = (id) => document.getElementById(id);
function esc(s){ const d=document.createElement('div'); d.textContent = s==null?'':String(s); return d.innerHTML; }

async function api(path, method = 'GET', body) {
  const headers = { 'Content-Type': 'application/json' };
  if (state.token) headers.Authorization = 'Bearer ' + state.token;
  const res = await fetch('/api' + path, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
  return data;
}

function show(view) {
  ['auth', 'patient', 'practitioner', 'therapist', 'room']
    .forEach(v => $('view-' + v).classList.add('hidden'));
  $('view-' + view).classList.remove('hidden');
}

function saveSession(d) {
  state.token = d.token; state.role = d.role; state.handle = d.handle;
  localStorage.setItem('anoncare', JSON.stringify({ token: d.token, role: d.role, handle: d.handle }));
  renderSession();
  routeToRole();
}

function renderSession() {
  const el = $('session');
  if (state.token) {
    el.innerHTML = 'Signed in as <b>' + state.handle + '</b> (' + state.role + ')';
    const b = document.createElement('button'); b.textContent = 'Log out'; b.className = 'secondary';
    b.onclick = logout; el.appendChild(b);
  } else { el.textContent = ''; }
}

function logout() {
  localStorage.removeItem('anoncare');
  state.token = state.role = state.handle = null;
  renderSession(); show('auth');
}

function routeToRole() {
  if (state.role === 'patient') { show('patient'); loadTherapists(); loadPatient(); }
  else if (state.role === 'practitioner') { show('practitioner'); loadPracCases(); }
  else if (state.role === 'therapist') { show('therapist'); loadTherapistAppts(); }
}

// ---- Auth wiring ----
$('reg-role').addEventListener('change', (e) => {
  $('clinician-fields').classList.toggle('hidden', e.target.value === 'patient');
});

$('btn-register').addEventListener('click', async () => {
  try {
    const d = await api('/auth/register', 'POST', {
      role: $('reg-role').value,
      handle: $('reg-handle').value.trim() || undefined,
      passphrase: $('reg-pass').value,
      displayName: $('reg-name').value || undefined,
      specialty: $('reg-spec').value || undefined,
    });
    $('auth-msg').style.color = '#7ee7c7';
    $('auth-msg').textContent = 'Account created. Your handle is ' + d.handle + ' — save it!';
    saveSession(d);
  } catch (e) { $('auth-msg').style.color = '#f7a8a8'; $('auth-msg').textContent = e.message; }
});

$('btn-login').addEventListener('click', async () => {
  try {
    const d = await api('/auth/login', 'POST', {
      handle: $('login-handle').value.trim(), passphrase: $('login-pass').value,
    });
    saveSession(d);
  } catch (e) { $('auth-msg').textContent = e.message; }
});

// ---- Patient ----
async function loadTherapists() {
  const list = await api('/auth/therapists');
  const sel = $('appt-therapist');
  sel.innerHTML = '';
  if (!list.length) { sel.innerHTML = '<option value="">No therapists available yet</option>'; return; }
  list.forEach(t => {
    const o = document.createElement('option');
    o.value = t.id;
    o.textContent = (t.display_name || t.anon_handle) + (t.specialty ? ' - ' + t.specialty : '');
    sel.appendChild(o);
  });
}

$('btn-new-case').addEventListener('click', async () => {
  const symptoms = $('case-symptoms').value.trim();
  if (!symptoms) return;
  await api('/cases', 'POST', { category: $('case-category').value, symptoms });
  $('case-symptoms').value = '';
  loadPatient();
});

$('btn-book').addEventListener('click', async () => {
  const therapistId = Number($('appt-therapist').value);
  const scheduledAt = $('appt-time').value;
  if (!therapistId || !scheduledAt) return;
  await api('/appointments', 'POST', { therapistId, scheduledAt, notes: $('appt-note').value || undefined });
  $('appt-note').value = '';
  loadPatient();
});

async function loadPatient() {
  const cases = await api('/cases');
  const cc = $('patient-cases');
  cc.innerHTML = cases.length ? '' : '<p class="muted">No consultations yet.</p>';
  cases.forEach(c => cc.appendChild(patientCaseRow(c)));
  const appts = await api('/appointments');
  const ac = $('patient-appts');
  ac.innerHTML = appts.length ? '' : '<p class="muted">No sessions yet.</p>';
  appts.forEach(a => ac.appendChild(apptRow(a, 'patient')));
}

function patientCaseRow(c) {
  const d = document.createElement('div');
  d.className = 'item';
  d.innerHTML = '<div class="meta">#' + c.id + ' &middot; ' + esc(c.category) + ' &middot; ' + esc(c.created_at) +
    '</div><div>' + esc(c.symptoms) + '</div><span class="badge ' + c.status + '">' + esc(c.status) + '</span>';
  const detail = document.createElement('div');
  const btn = document.createElement('button');
  btn.className = 'secondary'; btn.textContent = 'View result & messages';
  btn.onclick = () => renderCaseDetail(c.id, detail, false);
  d.appendChild(btn); d.appendChild(detail);
  return d;
}

// ---- Case detail + messaging (shared) ----
async function renderCaseDetail(id, container, clinician) {
  const c = await api('/cases/' + id);
  let html = '';
  if (c.prescriptions && c.prescriptions.length) {
    html += '<p><b>Prescriptions</b></p>';
    c.prescriptions.forEach(p => {
      html += '<div class="item">' + esc(p.medication) + ' - ' + esc(p.dosage) +
        '<div class="meta">' + esc(p.instructions || '') + '</div></div>';
    });
  }
  if (c.lab_requests && c.lab_requests.length) {
    html += '<p><b>Lab tests to take in person</b></p>';
    c.lab_requests.forEach(l => {
      html += '<div class="item">' + esc(l.test_name) +
        '<div class="meta">' + esc(l.facility_note || 'Please visit a partner facility for this test.') + '</div></div>';
    });
  }
  html += '<div class="thread" id="thread-case-' + id + '"></div>';
  html += '<div class="row"><input id="msg-case-' + id + '" placeholder="Write a secure message" />' +
    '<button data-send="' + id + '">Send</button></div>';
  container.innerHTML = html;
  container.querySelector('[data-send]').onclick = async () => {
    const inp = $('msg-case-' + id);
    if (!inp.value.trim()) return;
    await api('/messages/case/' + id, 'POST', { body: inp.value.trim() });
    inp.value = ''; loadThread('case', id);
  };
  loadThread('case', id);
}

async function loadThread(type, id) {
  const box = $('thread-' + type + '-' + id);
  if (!box) return;
  const msgs = await api('/messages/' + type + '/' + id);
  box.innerHTML = msgs.length ? '' : '<span class="muted">No messages yet.</span>';
  msgs.forEach(m => {
    const b = document.createElement('div'); b.className = 'bubble';
    b.innerHTML = '<b>' + esc(m.sender_role) + '</b>: ' + esc(m.body) +
      ' <span class="meta">' + esc(m.created_at) + '</span>';
    box.appendChild(b);
  });
  box.scrollTop = box.scrollHeight;
}

// ---- Practitioner ----
async function loadPracCases() {
  const cases = await api('/cases');
  const el = $('prac-cases');
  el.innerHTML = cases.length ? '' : '<p class="muted">Queue is empty.</p>';
  cases.forEach(c => {
    const d = document.createElement('div'); d.className = 'item';
    d.innerHTML = '<div class="meta">#' + c.id + ' &middot; ' + esc(c.category) + ' &middot; from ' +
      'anonymous patient &middot; ' + esc(c.created_at) + '</div><div>' + esc(c.symptoms) +
      '</div><span class="badge ' + c.status + '">' + esc(c.status) + '</span>';
    const btn = document.createElement('button');
    btn.textContent = 'Review';
    btn.onclick = () => reviewCase(c.id);
    d.appendChild(btn);
    el.appendChild(d);
  });
}

async function reviewCase(id) {
  await api('/cases/' + id + '/claim', 'POST', {});
  const panel = $('case-detail');
  panel.classList.remove('hidden');
  panel.innerHTML = '<h2>Reviewing consultation #' + id + '</h2>' +
    '<div class="grid2">' +
    '<div><h3>Prescribe medicine (no facility visit)</h3>' +
    '<input id="rx-med" placeholder="Medication e.g. Benzathine penicillin G" />' +
    '<input id="rx-dose" placeholder="Dosage e.g. 2.4M units IM single dose" />' +
    '<input id="rx-note" placeholder="Instructions" />' +
    '<button id="rx-send">Issue prescription</button></div>' +
    '<div><h3>Request in-person lab test</h3>' +
    '<input id="lab-name" placeholder="Test e.g. RPR / TPHA for syphilis" />' +
    '<input id="lab-note" placeholder="Why a facility visit is needed" />' +
    '<button id="lab-send" class="secondary">Request lab test</button></div></div>' +
    '<div id="prac-case-detail"></div>';
  $('rx-send').onclick = async () => {
    await api('/cases/' + id + '/prescribe', 'POST', {
      medication: $('rx-med').value, dosage: $('rx-dose').value, instructions: $('rx-note').value });
    reviewCase(id); loadPracCases();
  };
  $('lab-send').onclick = async () => {
    await api('/cases/' + id + '/lab', 'POST', {
      testName: $('lab-name').value, facilityNote: $('lab-note').value });
    reviewCase(id); loadPracCases();
  };
  renderCaseDetail(id, $('prac-case-detail'), true);
}

// ---- Therapist ----
async function loadTherapistAppts() {
  const appts = await api('/appointments');
  const el = $('ther-appts');
  el.innerHTML = appts.length ? '' : '<p class="muted">No sessions requested yet.</p>';
  appts.forEach(a => el.appendChild(apptRow(a, 'therapist')));
}

// ---- Appointment row (shared) ----
function apptRow(a, viewer) {
  const d = document.createElement('div'); d.className = 'item';
  d.innerHTML = '<div class="meta">Session #' + a.id + ' &middot; ' + esc(a.scheduled_at) +
    '</div><span class="badge ' + a.status + '">' + esc(a.status) + '</span>' +
    (a.notes ? '<div>' + esc(a.notes) + '</div>' : '');
  if (viewer === 'therapist' && a.status === 'requested') {
    const c = document.createElement('button'); c.textContent = 'Confirm';
    c.onclick = async () => { await api('/appointments/' + a.id + '/status', 'POST', { status: 'confirmed' }); loadTherapistAppts(); };
    d.appendChild(c);
  }
  const join = document.createElement('button'); join.className = 'secondary'; join.textContent = 'Enter video room';
  join.onclick = () => enterRoom(a); d.appendChild(join);
  return d;
}

// ---- Video room + WebRTC ----
let pc = null, localStream = null, pollTimer = null, lastTs = 0;

function enterRoom(appt) {
  state.currentAppt = appt;
  $('room-label').textContent = '#' + appt.id + ' (' + appt.status + ')';
  $('room-status').textContent = 'Click Start / Join call to connect.';
  show('room');
}

$('btn-back').addEventListener('click', () => { leaveCall(); routeToRole(); });
$('btn-leave-call').addEventListener('click', leaveCall);
$('btn-join-call').addEventListener('click', startCall);

async function sendSignal(kind, data) {
  await api('/appointments/' + state.currentAppt.id + '/signal', 'POST', { kind, data });
}

async function startCall() {
  if (pc) return;
  const status = $('room-status');
  status.textContent = 'Requesting camera & microphone...';
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  } catch (e) { status.textContent = 'Cannot access camera/mic: ' + e.message; return; }
  $('local-video').srcObject = localStream;
  pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
  localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
  pc.ontrack = (ev) => { $('remote-video').srcObject = ev.streams[0]; };
  pc.onicecandidate = (ev) => { if (ev.candidate) sendSignal('ice', ev.candidate); };

  // Whoever clicks first becomes the caller by sending an offer; the poll loop
  // handles whichever role we end up in (offer vs answer).
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await sendSignal('offer', offer);
  status.textContent = 'Connecting... waiting for the other participant.';
  startPolling();
}

function startPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(async () => {
    if (!state.currentAppt) return;
    let resp;
    try { resp = await api('/appointments/' + state.currentAppt.id + '/signal?since=' + lastTs); }
    catch (e) { return; }
    lastTs = resp.now;
    for (const m of resp.messages) {
      try { await handleSignal(m); } catch (e) { /* ignore */ }
    }
  }, 1500);
}

async function handleSignal(m) {
  if (!pc) return;
  if (m.kind === 'offer') {
    // Glare handling: only answer if we haven't set a remote offer yet.
    if (pc.signalingState === 'stable' || pc.signalingState === 'have-local-offer') {
      await pc.setRemoteDescription(new RTCSessionDescription(m.data));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await sendSignal('answer', answer);
      $('room-status').textContent = 'Connected.';
    }
  } else if (m.kind === 'answer') {
    if (pc.signalingState === 'have-local-offer') {
      await pc.setRemoteDescription(new RTCSessionDescription(m.data));
      $('room-status').textContent = 'Connected.';
    }
  } else if (m.kind === 'ice') {
    try { await pc.addIceCandidate(new RTCIceCandidate(m.data)); } catch (e) {}
  }
}

function leaveCall() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  if (pc) { pc.close(); pc = null; }
  if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
  $('local-video').srcObject = null; $('remote-video').srcObject = null;
  $('room-status').textContent = 'Call ended.';
}

// ---- Bootstrap ----
(function init() {
  const saved = localStorage.getItem('anoncare');
  if (saved) {
    try { Object.assign(state, JSON.parse(saved)); } catch (e) {}
  }
  if (state.token) { renderSession(); routeToRole(); }
  else { show('auth'); }
})();

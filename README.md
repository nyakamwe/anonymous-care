# AnonCare — Anonymous Telehealth MVP

A working minimum viable product for private, anonymous online treatment.
Patients describe symptoms without giving a real name; a practitioner reviews
the case and either **prescribes medicine online** or **requests an in-person
lab test** (e.g. RPR/TPHA to confirm syphilis) when a sample is needed.
Patients who need counselling can **book a session with a therapist and meet
over live in-browser video**.

## Features

- **Anonymous accounts** — patients register with an auto-generated handle
  (`anon-xxxxxxxx`) + passphrase. No name, email, or phone is collected.
- **Symptom consultations** — patient submits a concern + symptom description.
- **Practitioner queue** — clinicians claim a case, then:
  - **Prescribe** medication, dosage, instructions (no facility visit), or
  - **Request an in-person lab test** with a note explaining why the patient
    must visit a partner facility.
- **Secure per-case messaging** between patient and practitioner.
- **Counselling booking** — patient picks a therapist + time; therapist
  confirms/cancels/completes.
- **Live video sessions** — WebRTC peer-to-peer video/audio with a built-in
  HTTP signaling relay (no third-party video vendor needed for the demo).
- **Role-based access control** — patients only see their own records;
  cross-patient access is blocked (covered by automated tests).

## Tech stack

- **Backend:** Node.js + Express, JWT auth (`jsonwebtoken`), password hashing
  (`bcryptjs`).
- **Storage:** dependency-free JSON file store (`store.js`) so it runs anywhere
  with zero native modules. Swap for PostgreSQL/MySQL in production.
- **Frontend:** vanilla HTML/CSS/JS (CSP-safe, no inline scripts), single page
  with patient / practitioner / therapist portals + a shared video room.

## Run it

```bash
npm install        # installs express, bcryptjs, jsonwebtoken
npm start          # serves http://127.0.0.1:3000
```

Open http://127.0.0.1:3000 in two browser windows (or two devices on the same
machine) to try the patient and clinician/therapist sides. For the video call,
open the same appointment's room on both sides and click *Start / Join call*.

> Live video needs `https://` (or `localhost`) for camera access, and a TURN
> server to work reliably across different networks/NAT. The bundled STUN-only
> config works for same-machine / simple-network demos.

```bash
npm test           # runs the in-process smoke test (17 checks)
```

## Project layout

```
server.js               Express app, security headers, static hosting
store.js                JSON-file data layer (users, cases, rx, labs, appts, messages)
middleware/auth.js      JWT sign + auth/role guards
routes/auth.js          anonymous register / login / therapist list
routes/cases.js         submit case, queue, claim, prescribe, request lab
routes/appointments.js  booking, status, WebRTC signaling relay
routes/messages.js      secure per-thread messaging
public/                 frontend (index.html, styles.css, app.js)
test.js                 smoke test of the full flow
```

## Before real-world use (important)

This is a functional prototype, **not** a production clinical system. Handling
real patient health data and prescriptions carries legal and safety
obligations. At minimum you must address:

1. **Regulatory compliance** — HIPAA (US), GDPR (EU), or your local equivalent;
   telemedicine and e-prescribing laws often require identity/eligibility
   checks that can tension with full anonymity. Get qualified legal advice on
   how much anonymity is permissible in your jurisdiction.
2. **Clinician licensing & verification** — verify that practitioners and
   therapists are licensed before granting those roles (this MVP lets anyone
   self-select a role).
3. **E-prescription integrity** — real prescriptions need a regulated pharmacy
   channel, controlled-substance rules, and audit trails.
4. **Encryption** — TLS in transit and encryption at rest; the JWT secret and
   any keys must come from a secret manager, not source code.
5. **Data retention & audit logging** — who accessed what, and when.
6. **Clinical safety** — red-flag/triage rules and clear escalation to
   emergency care for dangerous symptoms.
7. **TURN server** — for reliable video across networks.

I can help implement any of these next steps.

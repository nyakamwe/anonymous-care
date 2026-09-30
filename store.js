// Dependency-free persistent data layer (JSON file on disk).
// Chosen for portability so the MVP runs anywhere without native modules.
// For production, swap this module for PostgreSQL/MySQL with encryption at rest.
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'data.json');
const empty = { users: [], cases: [], prescriptions: [], lab_requests: [], appointments: [], messages: [], seq: {} };

let data;
try { data = JSON.parse(fs.readFileSync(FILE, 'utf8')); }
catch (e) { data = JSON.parse(JSON.stringify(empty)); }
for (const k of Object.keys(empty)) if (data[k] === undefined) data[k] = empty[k];

function save() { fs.writeFileSync(FILE, JSON.stringify(data, null, 2)); }
function nextId(kind) { data.seq[kind] = (data.seq[kind] || 0) + 1; return data.seq[kind]; }
function now() { return new Date().toISOString().slice(0, 19).replace('T', ' '); }

function insert(kind, row) {
  row.id = nextId(kind);
  row.created_at = row.created_at || now();
  data[kind].push(row);
  save();
  return row;
}
function find(kind, pred) { return data[kind].filter(pred); }
function findOne(kind, pred) { return data[kind].find(pred); }
function update(kind, id, patch) {
  const row = data[kind].find(r => r.id === id);
  if (!row) return null;
  Object.assign(row, patch);
  save();
  return row;
}

module.exports = { data, save, insert, find, findOne, update, now };

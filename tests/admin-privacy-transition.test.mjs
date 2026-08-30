/** Admin login/logout must switch between public-safe and private tournament representations. */
import assert from 'node:assert/strict';

const storage = new Map();
globalThis.sessionStorage = {
  getItem: (key) => storage.get(key) || null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
};

const publicTournament = {
  id: 7,
  name: 'Privacy transition',
  revision: 3,
  players: ['A'],
  registrationSettings: { enabled: true, capacity: 8 },
};
const adminTournament = {
  ...publicTournament,
  participantDetails: { A: { phone: '0912345678', notes: 'private', answers: { team: 'A' } } },
  registrationSettings: { ...publicTournament.registrationSettings, token: 'private-token' },
};
const calls = [];

globalThis.fetch = async (path, options = {}) => {
  const method = options.method || 'GET';
  const headers = new Headers(options.headers || {});
  const authorization = headers.get('authorization') || '';
  calls.push({ path: String(path), method, authorization, ifNoneMatch: headers.get('if-none-match') || '' });
  if (path === '/api/admin/login' && method === 'POST') {
    return json({ token: 'admin-token' });
  }
  if (path === '/api/tournaments' && method === 'GET') {
    if (authorization === 'Bearer admin-token') return json({ tournaments: [adminTournament] }, 200, { etag: '"tla-admin"' });
    return json({ tournaments: [publicTournament] }, 200, { etag: '"tl-public"' });
  }
  if (path === '/api/admin/session' && method === 'GET') return json({ authenticated: authorization === 'Bearer admin-token' });
  return json({ error: 'unexpected request' }, 500);
};

const store = await import('../src/data/store.js');
await store.initializeStore();
let state = store.getState();
assert.equal(state.isAdmin, false);
assert.equal('participantDetails' in state.tournaments[0], false, 'initial public state has no participant personal data');

await store.loginAdmin('2468');
state = store.getState();
assert.equal(state.isAdmin, true);
assert.equal(state.tournaments[0].participantDetails.A.phone, '0912345678', 'login reloads the private admin representation');
assert.equal(state.tournaments[0].registrationSettings.token, 'private-token', 'login reloads private registration token');
const adminListCall = calls.find((call) => call.path === '/api/tournaments' && call.authorization === 'Bearer admin-token');
assert.ok(adminListCall, 'login explicitly reloads tournament data with admin authorization');
assert.equal(adminListCall.ifNoneMatch, '', 'login does not reuse the public representation ETag');

store.logoutAdmin();
state = store.getState();
assert.equal(state.isAdmin, false);
assert.equal('participantDetails' in state.tournaments[0], false, 'logout immediately drops private participant data from memory');
assert.equal('token' in state.tournaments[0].registrationSettings, false, 'logout immediately drops private registration token from memory');
assert.equal(storage.has('spin-admin-token'), false, 'logout removes the admin session token');

console.log('PASS admin privacy transition');

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

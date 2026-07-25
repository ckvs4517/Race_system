/** 公開報名 API：公開表單、重複防護、個資邊界與後台核准加入名單。 */
import assert from 'node:assert/strict';
import worker from '../worker/index.js';

class MockStatement {
  constructor(database, sql) { this.database = database; this.sql = sql.replace(/\s+/g, ' ').trim(); this.values = []; }
  bind(...values) { this.values = values; return this; }
  async all() {
    if (this.sql.includes('FROM registrations')) {
      const tournamentId = String(this.values[0]);
      return { results: [...this.database.registrations.values()].filter((row) => row.tournament_id === tournamentId) };
    }
    return { results: [...this.database.tournaments.values()].map((row) => ({ data: row.data, revision: row.revision })) };
  }
  async first() {
    if (this.sql.startsWith('SELECT COUNT(*)')) {
      const tournamentId = String(this.values[0]);
      const count = [...this.database.registrations.values()].filter((row) => row.tournament_id === tournamentId && ['pending', 'waitlist'].includes(row.status)).length;
      return { count };
    }
    if (this.sql.includes('FROM registrations')) return this.database.registrations.get(String(this.values[0])) || null;
    const row = this.database.tournaments.get(String(this.values[0]));
    return row ? { data: row.data, revision: row.revision } : null;
  }
  async run() {
    if (this.sql.startsWith('INSERT INTO tournaments')) {
      this.database.tournaments.set(String(this.values[0]), { data: this.values[1], revision: this.values[2] });
      return changed(1);
    }
    if (this.sql.startsWith('INSERT INTO registrations')) {
      const [id, tournamentId, displayName, phone, notes, answers, dedupeKey] = this.values;
      const duplicate = [...this.database.registrations.values()].some((row) => row.tournament_id === String(tournamentId) && row.dedupe_key === dedupeKey);
      if (duplicate) throw new Error('UNIQUE constraint failed');
      this.database.registrations.set(String(id), {
        id: String(id), tournament_id: String(tournamentId), display_name: displayName, phone, notes, answers,
        dedupe_key: dedupeKey, status: 'pending', created_at: '2026-07-25 12:00:00', updated_at: '2026-07-25 12:00:00',
      });
      return changed(1);
    }
    if (this.sql.startsWith('UPDATE tournaments')) {
      const [data, revision, id, expectedRevision] = this.values;
      const current = this.database.tournaments.get(String(id));
      if (!current || current.revision !== expectedRevision) return changed(0);
      this.database.tournaments.set(String(id), { data, revision });
      return changed(1);
    }
    if (this.sql.startsWith('UPDATE registrations SET status = ?')) {
      const [status, id] = this.values;
      const row = this.database.registrations.get(String(id));
      if (!row) return changed(0);
      row.status = status;
      return changed(1);
    }
    if (this.sql.includes("UPDATE registrations SET status = 'approved'")) {
      const row = this.database.registrations.get(String(this.values[0]));
      if (!row) return changed(0);
      row.status = 'approved';
      return changed(1);
    }
    return changed(0);
  }
}

class MockDatabase {
  constructor() { this.tournaments = new Map(); this.registrations = new Map(); }
  prepare(sql) { return new MockStatement(this, sql); }
  async batch(statements) {
    const results = [];
    for (const statement of statements) results.push(await statement.run());
    return results;
  }
}

const env = {
  DB: new MockDatabase(),
  ADMIN_PIN: '2468',
  TOKEN_SECRET: 'registration-test-secret',
  ASSETS: { fetch: () => new Response('asset') },
};
const request = (path, options = {}) => worker.fetch(new Request(`https://example.com${path}`, options), env);
const login = await request('/api/admin/login', { method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ pin: '2468' }) });
const token = (await login.json()).token;
const adminHeaders = jsonHeaders(token);

const tournament = {
  id: 901,
  name: '公開報名測試',
  format: 'swiss',
  status: '準備中',
  players: [],
  rounds: [],
  participantStates: {},
  registrationSettings: {
    enabled: true,
    token: 'public-registration-token-901',
    capacity: 8,
    deadline: '',
    fields: [{ id: 'teamName', label: '隊伍名稱', type: 'text', required: true }],
  },
};
const created = await request('/api/tournaments', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ tournament }) });
assert.equal(created.status, 201, '準備中賽事可以先用空名單建立');

const publicPath = '/api/public/registrations/901/public-registration-token-901';
const publicInfo = await request(publicPath);
const publicData = await publicInfo.json();
assert.equal(publicInfo.status, 200);
assert.equal(publicData.tournament.name, tournament.name);
assert.equal('phone' in publicData, false, '公開報名資訊不包含報名者個資');

const submitted = await request(publicPath, {
  method: 'POST',
  headers: jsonHeaders(),
  body: JSON.stringify({ displayName: '選手甲', phone: '0912-345-678', notes: '第一次參賽', answers: { teamName: '烈焰隊' } }),
});
const submittedData = await submitted.json();
assert.equal(submitted.status, 201);
assert.equal(submittedData.registration.status, 'pending');

const duplicate = await request(publicPath, {
  method: 'POST',
  headers: jsonHeaders(),
  body: JSON.stringify({ displayName: '選手甲', phone: '0912-345-678', answers: { teamName: '烈焰隊' } }),
});
assert.equal(duplicate.status, 409, '相同選手與電話不可重複報名');

const list = await request('/api/tournaments/901/registrations', { headers: adminHeaders });
const registrations = (await list.json()).registrations;
assert.equal(registrations.length, 1);
assert.equal(registrations[0].phone, '0912-345-678', '個資只在後台名單提供');
assert.equal(registrations[0].answers.teamName, '烈焰隊', '自訂欄位答案保留擴充性');

const approved = await request(`/api/registrations/${registrations[0].id}`, {
  method: 'PUT',
  headers: adminHeaders,
  body: JSON.stringify({ status: 'approved', expectedRevision: 1 }),
});
const approvedData = await approved.json();
assert.equal(approved.status, 200);
assert.deepEqual(approvedData.tournament.players, ['選手甲']);
assert.equal(approvedData.registration.status, 'approved');

console.log('PASS registration flow');

function jsonHeaders(token = '') {
  return { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) };
}

function changed(count) {
  return { success: true, meta: { changes: count } };
}

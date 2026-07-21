import worker from '../worker/index.js';

class MockStatement {
  constructor(database, sql) { this.database = database; this.sql = sql; this.values = []; }
  bind(...values) { this.values = values; return this; }
  async all() { return { results: [...this.database.rows.values()].map((data) => ({ data })) }; }
  async run() {
    if (this.sql.startsWith('DELETE')) this.database.rows.clear();
    if (this.sql.startsWith('INSERT')) this.database.rows.set(this.values[0], this.values[1]);
    return { success: true };
  }
}

class MockDatabase {
  constructor() { this.rows = new Map(); }
  prepare(sql) { return new MockStatement(this, sql); }
  async batch(statements) { for (const statement of statements) await statement.run(); }
}

const env = {
  DB: new MockDatabase(),
  ADMIN_PIN: '2468',
  TOKEN_SECRET: 'test-secret-that-is-long-enough',
  ASSETS: { fetch: () => new Response('asset') },
};

const request = (path, options = {}) => worker.fetch(new Request(`https://example.com${path}`, options), env);
const login = await request('/api/admin/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pin: '2468' }) });
assert(login.status === 200, '正確 PIN 可以登入');
const { token } = await login.json();

const denied = await request('/api/tournaments', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tournaments: [] }) });
assert(denied.status === 401, '未登入不可修改賽事');

const tournament = { id: 1, name: 'API 測試賽', players: ['A', 'B'], rounds: [] };
const saved = await request('/api/tournaments', { method: 'PUT', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ tournaments: [tournament] }) });
assert(saved.status === 200, '登入後可以儲存賽事');

const listed = await request('/api/tournaments');
const data = await listed.json();
assert(data.tournaments.length === 1 && data.tournaments[0].name === tournament.name, '公開 API 可以讀取雲端賽事');

const session = await request('/api/admin/session', { headers: { authorization: `Bearer ${token}` } });
assert((await session.json()).authenticated === true, '有效登入權杖可以恢復後台工作階段');

console.log('PASS 5 API tests');

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`PASS ${message}`);
}

/** Worker API 測試：登入、權限、CRUD、revision 衝突與工作階段。 */
import worker from '../worker/index.js';
import { createTournament } from '../src/domain/tournament.js';

class MockStatement {
  constructor(database, sql) { this.database = database; this.sql = sql; this.values = []; }
  bind(...values) { this.values = values; return this; }
  async all() {
    return { results: [...this.database.rows.values()].map((row) => ({ data: row.data, revision: row.revision })) };
  }
  async first() {
    const row = this.database.rows.get(String(this.values[0]));
    return row ? { data: row.data, revision: row.revision } : null;
  }
  async run() {
    if (this.sql.startsWith('DELETE FROM tournaments WHERE')) {
      const [id, revision] = this.values;
      const row = this.database.rows.get(String(id));
      const changed = row && row.revision === revision ? Number(this.database.rows.delete(String(id))) : 0;
      return { success: true, meta: { changes: changed } };
    }
    if (this.sql.startsWith('DELETE')) {
      const changes = this.database.rows.size;
      this.database.rows.clear();
      return { success: true, meta: { changes } };
    }
    if (this.sql.startsWith('INSERT')) {
      this.database.rows.set(String(this.values[0]), { data: this.values[1], revision: this.values[2] });
      return { success: true, meta: { changes: 1 } };
    }
    if (this.sql.startsWith('UPDATE')) {
      const [data, nextRevision, id, expectedRevision] = this.values;
      const row = this.database.rows.get(String(id));
      if (!row || row.revision !== expectedRevision) return { success: true, meta: { changes: 0 } };
      this.database.rows.set(String(id), { data, revision: nextRevision });
      return { success: true, meta: { changes: 1 } };
    }
    return { success: true, meta: { changes: 0 } };
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
const authorizedHeaders = { 'content-type': 'application/json', authorization: `Bearer ${token}` };

const denied = await request('/api/tournaments', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tournaments: [] }) });
assert(denied.status === 401, '未登入不可修改賽事');

const tournament = { id: 1, name: 'API 測試賽', status: '準備中', players: ['A', 'B'], rounds: [] };
const created = await request('/api/tournaments', { method: 'POST', headers: authorizedHeaders, body: JSON.stringify({ tournament }) });
const createdData = await created.json();
assert(created.status === 201 && createdData.tournament.revision === 1, '登入後可建立單一賽事並取得版本');

const listed = await request('/api/tournaments');
const data = await listed.json();
assert(data.tournaments.length === 1 && data.tournaments[0].name === tournament.name, '公開 API 可以讀取雲端賽事');
const listEtag = listed.headers.get('etag');
const unchangedList = await request('/api/tournaments', { headers: { 'if-none-match': listEtag } });
assert(Boolean(listEtag) && unchangedList.status === 304, '賽事清單未變時使用 ETag 省略重複資料');

const updatedTournament = { ...createdData.tournament, name: '裁判 A 更新' };
const updated = await request('/api/tournaments/1', { method: 'PUT', headers: authorizedHeaders, body: JSON.stringify({ tournament: updatedTournament, expectedRevision: 1 }) });
const updatedData = await updated.json();
assert(updated.status === 200 && updatedData.tournament.revision === 2, '單一賽事更新後版本自動增加');

const staleTournament = { ...createdData.tournament, name: '裁判 B 舊資料' };
const conflict = await request('/api/tournaments/1', { method: 'PUT', headers: authorizedHeaders, body: JSON.stringify({ tournament: staleTournament, expectedRevision: 1 }) });
const conflictData = await conflict.json();
assert(conflict.status === 409 && conflictData.tournament.name === '裁判 A 更新', '舊版本不能覆蓋其他裁判的新資料');

const single = await request('/api/tournaments/1');
assert(single.status === 200 && (await single.json()).tournament.revision === 2, '可以取得單一賽事最新版本');
const singleEtag = single.headers.get('etag');
const unchangedSingle = await request('/api/tournaments/1', { headers: { 'if-none-match': singleEtag } });
assert(Boolean(singleEtag) && unchangedSingle.status === 304, '單一賽事未變時不重送完整 JSON');

const actionDraft = { ...createTournament('後端操作測試', ['甲', '乙']), id: 2 };
const actionCreatedResponse = await request('/api/tournaments', {
  method: 'POST',
  headers: authorizedHeaders,
  body: JSON.stringify({ tournament: actionDraft }),
});
const actionCreated = (await actionCreatedResponse.json()).tournament;
assert(actionCreatedResponse.status === 201 && actionCreated.revision === 1, '可以建立供後端指令操作的賽事');

const action = (type, payload, expectedRevision) => request('/api/tournaments/2/actions', {
  method: 'POST',
  headers: authorizedHeaders,
  body: JSON.stringify({ type, payload, expectedRevision }),
});
await action('set_check_in', { player: '甲', checkedIn: true }, 1);
const secondCheckIn = await action('set_check_in', { player: '乙', checkedIn: true }, 2);
assert(secondCheckIn.status === 200 && (await secondCheckIn.json()).tournament.revision === 3, '報到由後端依序套用並增加版本');

const startedResponse = await action('start_tournament', {}, 3);
const startedTournament = (await startedResponse.json()).tournament;
assert(startedResponse.status === 200 && startedTournament.rounds[0].matches[0].status === '可開始', '開賽與賽程產生由後端執行');

const completedResponse = await action('record_match', { roundIndex: 0, matchIndex: 0, scoreA: 4, scoreB: 2 }, 4);
const completedTournament = (await completedResponse.json()).tournament;
assert(completedResponse.status === 200 && completedTournament.status === '已完成' && completedTournament.revision === 5, '後端記分後完成賽事並保存新版本');

const forbiddenFullOverwrite = await request('/api/tournaments/2', {
  method: 'PUT',
  headers: authorizedHeaders,
  body: JSON.stringify({ tournament: { ...completedTournament, champion: '竄改冠軍' }, expectedRevision: 5 }),
});
assert(forbiddenFullOverwrite.status === 400, '賽事開始後禁止以前端整包資料覆寫正式賽果');

const staleAction = await action('record_match', { roundIndex: 0, matchIndex: 0, scoreA: 4, scoreB: 1 }, 4);
assert(staleAction.status === 409 && (await staleAction.json()).tournament.revision === 5, '後端拒絕裁判以舊版本覆蓋最新賽果');

const session = await request('/api/admin/session', { headers: { authorization: `Bearer ${token}` } });
assert((await session.json()).authenticated === true, '有效登入權杖可以恢復後台工作階段');

console.log('PASS 16 API tests');

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`PASS ${message}`);
}

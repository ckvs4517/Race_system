/** Worker API 測試：登入、權限、CRUD、revision 衝突與工作階段。 */
import worker from '../worker/index.js';
import { MAX_TOURNAMENT_PLAYERS, createTournament } from '../src/domain/tournament.js';

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
  BACKUP_TOKEN: 'backup-only-test-secret',
  ASSETS: { fetch: () => new Response('asset') },
};

const request = (path, options = {}) => worker.fetch(new Request(`https://example.com${path}`, options), env);
const login = await request('/api/admin/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pin: '2468' }) });
assert(login.status === 200, '正確 PIN 可以登入');
const { token } = await login.json();
const authorizedHeaders = { 'content-type': 'application/json', authorization: `Bearer ${token}` };

const denied = await request('/api/tournaments', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tournaments: [] }) });
assert(denied.status === 401, '未登入不可修改賽事');

const tournament = {
  id: 1,
  name: 'API 測試賽',
  status: '準備中',
  players: ['A', 'B'],
  rounds: [],
  participantDetails: { A: { phone: '0900000000' } },
};
const created = await request('/api/tournaments', { method: 'POST', headers: authorizedHeaders, body: JSON.stringify({ tournament }) });
const createdData = await created.json();
assert(created.status === 201 && createdData.tournament.revision === 1, '登入後可建立單一賽事並取得版本');

const backupDenied = await request('/api/backup');
assert(backupDenied.status === 401, '未提供備份憑證不可取得完整備份');
const backupAdminDenied = await request('/api/backup', { headers: { authorization: `Bearer ${token}` } });
assert(backupAdminDenied.status === 401, '一般 Admin token 不等同長期備份憑證');
const backupResponse = await request('/api/backup', { headers: { authorization: `Bearer ${env.BACKUP_TOKEN}` } });
const backup = await backupResponse.json();
assert(backupResponse.status === 200
  && backup.format === 'spin-league-backup'
  && backup.version === 1
  && Array.isArray(backup.tournaments)
  && backup.tournaments.some((item) => item.name === tournament.name && item.participantDetails?.A?.phone === '0900000000'), '唯讀備份憑證可取得與手動備份相容的完整資料');
const backupWriteDenied = await request('/api/backup', { method: 'POST', headers: { authorization: `Bearer ${env.BACKUP_TOKEN}` } });
assert(backupWriteDenied.status === 404, '備份憑證沒有任何寫入 API');

const largePlayers = Array.from({ length: MAX_TOURNAMENT_PLAYERS }, (_, index) => `大型選手${index + 1}`);
const largeDraft = { ...createTournament('48 人 API 測試賽', largePlayers, 'swiss'), id: 48 };
const largeCreatedResponse = await request('/api/tournaments', { method: 'POST', headers: authorizedHeaders, body: JSON.stringify({ tournament: largeDraft }) });
const largeCreated = await largeCreatedResponse.json();
assert(largeCreatedResponse.status === 201 && largeCreated.tournament.players.length === MAX_TOURNAMENT_PLAYERS, '後端允許建立 48 人大型賽事');
const largeCheckInResponse = await request('/api/tournaments/48/actions', {
  method: 'POST',
  headers: authorizedHeaders,
  body: JSON.stringify({ type: 'set_all_check_in', payload: {}, expectedRevision: 1 }),
});
const largeCheckedIn = (await largeCheckInResponse.json()).tournament;
assert(largeCheckInResponse.status === 200
  && largeCheckedIn.revision === 2
  && largeCheckedIn.players.every((player) => largeCheckedIn.participantStates[player].checkedIn), '48 人一鍵報到只寫入一個新版本');

const listed = await request('/api/tournaments');
const data = await listed.json();
assert(data.tournaments.some((item) => item.name === tournament.name), '公開 API 可以讀取雲端賽事');
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

const bulkDraft = { ...createTournament('批次名單測試', ['A', 'B', 'C']), id: 3 };
await request('/api/tournaments', {
  method: 'POST',
  headers: authorizedHeaders,
  body: JSON.stringify({ tournament: bulkDraft }),
});
const bulkRemovedResponse = await request('/api/tournaments/3/actions', {
  method: 'POST',
  headers: authorizedHeaders,
  body: JSON.stringify({ type: 'remove_players', payload: { players: ['B', 'C'] }, expectedRevision: 1 }),
});
const bulkRemoved = (await bulkRemovedResponse.json()).tournament;
assert(bulkRemovedResponse.status === 200 && bulkRemoved.revision === 2 && bulkRemoved.players.join(',') === 'A', '批次移除選手只寫入一個新版本');

await action('set_check_in', { player: '甲', checkedIn: true }, 1);
const secondCheckIn = await action('set_check_in', { player: '乙', checkedIn: true }, 2);
assert(secondCheckIn.status === 200 && (await secondCheckIn.json()).tournament.revision === 3, '報到由後端依序套用並增加版本');

const preparedResponse = await action('prepare_tournament_schedule', {}, 3);
const preparedTournament = (await preparedResponse.json()).tournament;
assert(preparedResponse.status === 200 && preparedTournament.status === '排程中' && preparedTournament.rounds.length === 0, '確認報到後先進入無賽程的排程階段');
const randomizedResponse = await action('randomize_schedule', {}, 4);
const randomizedTournament = (await randomizedResponse.json()).tournament;
assert(randomizedResponse.status === 200 && randomizedTournament.rounds[0].matches[0].status === '可開始', '隨機分組由後端產生首輪賽程');
const openingMatch = randomizedTournament.rounds[0].matches[0];
const adjustedResponse = await action('update_opening_pairings', { pairs: [[openingMatch.playerB, openingMatch.playerA]] }, 5);
const adjustedTournament = (await adjustedResponse.json()).tournament;
assert(adjustedResponse.status === 200 && adjustedTournament.rounds[0].matches[0].playerA === openingMatch.playerB, '首輪對戰可在後端驗證後手動調整');
const startedResponse = await action('confirm_tournament_schedule', {}, 6);
const startedTournament = (await startedResponse.json()).tournament;
assert(startedResponse.status === 200 && startedTournament.status === '進行中', '確認目前配對後才正式開賽');

const completedResponse = await action('record_match', { roundIndex: 0, matchIndex: 0, scoreA: 4, scoreB: 2 }, 7);
const completedTournament = (await completedResponse.json()).tournament;
assert(completedResponse.status === 200 && completedTournament.status === '已完成' && completedTournament.revision === 8, '後端記分後完成賽事並保存新版本');

const forbiddenFullOverwrite = await request('/api/tournaments/2', {
  method: 'PUT',
  headers: authorizedHeaders,
  body: JSON.stringify({ tournament: { ...completedTournament, champion: '竄改冠軍' }, expectedRevision: 8 }),
});
assert(forbiddenFullOverwrite.status === 400, '賽事開始後禁止以前端整包資料覆寫正式賽果');

const staleAction = await action('record_match', { roundIndex: 0, matchIndex: 0, scoreA: 4, scoreB: 1 }, 7);
assert(staleAction.status === 409 && (await staleAction.json()).tournament.revision === 8, '後端拒絕裁判以舊版本覆蓋最新賽果');

const session = await request('/api/admin/session', { headers: { authorization: `Bearer ${token}` } });
assert((await session.json()).authenticated === true, '有效登入權杖可以恢復後台工作階段');

console.log('PASS 25 API tests');

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`PASS ${message}`);
}

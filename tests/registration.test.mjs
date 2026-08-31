/** 私密參賽資料 API：直入正式名單、重複防護、個資邊界與網址撤銷。 */
import assert from 'node:assert/strict';
import worker from '../worker/index.js';
import { MAX_TOURNAMENT_PLAYERS, createTournament, prepareTournamentSchedule, setDraftPlayerCheckedIn, updateRegistrationSettings } from '../src/domain/tournament.js';
import { createDefaultDrinkSettings } from '../src/domain/drinks.js';
import { registrationAdminView } from '../src/views/registration-admin.js';
import { registrationView } from '../src/views/registration.js';

globalThis.location = new URL('https://example.com/');

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

const maxCapacityDraft = updateRegistrationSettings(createTournament('48 人報名設定', [], 'swiss'), { capacity: MAX_TOURNAMENT_PLAYERS });
assert.equal(maxCapacityDraft.registrationSettings.capacity, MAX_TOURNAMENT_PLAYERS, '私密報名名額可設定到大型賽事上限');

const tournament = {
  id: 901,
  name: '公開報名測試',
  format: 'swiss',
  bracketVersion: 2,
  swissVersion: 2,
  status: '準備中',
  players: [],
  rounds: [],
  participantStates: {},
  participantDetails: {},
  drinkSettings: createDefaultDrinkSettings(),
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
const publicRegistrationPage = registrationView({ data: publicData });
assert.doesNotMatch(publicRegistrationPage, /data-drink-fields/, '新的私密填寫頁不再顯示飲品選擇');
assert.doesNotMatch(publicRegistrationPage, /確認名稱、電話與飲品/, '新的私密填寫流程不再要求飲品');

const submitted = await request(publicPath, {
  method: 'POST',
  headers: jsonHeaders(),
  body: JSON.stringify({ displayName: '選手甲', phone: '0912-345-678', notes: '第一次參賽 · 12345 · 無糖綠茶', answers: { teamName: '烈焰隊' } }),
});
const submittedData = await submitted.json();
assert.equal(submitted.status, 201);
assert.equal(submittedData.participant.displayName, '選手甲');

const duplicate = await request(publicPath, {
  method: 'POST',
  headers: jsonHeaders(),
  body: JSON.stringify({ displayName: '選手甲', phone: '0912-345-678', answers: { teamName: '烈焰隊' } }),
});
assert.equal(duplicate.status, 409, '相同選手與電話不可重複報名');

const invalidDrink = await request(publicPath, {
  method: 'POST',
  headers: jsonHeaders(),
  body: JSON.stringify({ displayName: '選手乙', phone: '0988-000-000', answers: { teamName: '測試隊' }, drink: { itemId: 'not-a-drink' } }),
});
assert.equal(invalidDrink.status, 400, '後端拒絕菜單中不存在的飲品組合');

const publicLatestResponse = await request('/api/tournaments/901');
const publicLatest = (await publicLatestResponse.json()).tournament;
assert.deepEqual(publicLatest.players, ['選手甲'], '公開賽事仍可讀取正式名單與賽程所需資料');
assert.equal('participantDetails' in publicLatest, false, '公開單場 API 不回傳電話、備註與自訂答案');
assert.equal('token' in (publicLatest.registrationSettings || {}), false, '公開單場 API 不回傳私密報名 token');
const publicEtag = publicLatestResponse.headers.get('etag');

const publicList = await request('/api/tournaments');
const publicListData = await publicList.json();
const publicListedTournament = publicListData.tournaments.find((item) => item.id === 901);
assert.equal('participantDetails' in publicListedTournament, false, '公開賽事清單不回傳 participantDetails');
assert.equal('token' in (publicListedTournament.registrationSettings || {}), false, '公開賽事清單不回傳私密報名 token');

const adminLatestResponse = await request('/api/tournaments/901', { headers: { authorization: `Bearer ${token}`, 'if-none-match': publicEtag } });
const latest = (await adminLatestResponse.json()).tournament;
assert.equal(adminLatestResponse.status, 200, '管理端不會誤用公開 ETag 而收到 304');
assert.equal(latest.participantStates['選手甲'].checkedIn, false);
assert.equal(latest.participantDetails['選手甲'].phone, '0912-345-678', '登入管理端仍可取得聯絡電話');
assert.equal(latest.participantDetails['選手甲'].notes, '第一次參賽 · 12345 · 無糖綠茶', '登入管理端仍可取得私人備註');
assert.equal(latest.participantDetails['選手甲'].answers.teamName, '烈焰隊', '登入管理端仍可取得自訂欄位答案');
assert.equal(latest.participantDetails['選手甲'].drink, null, '即使舊賽事仍有 drinkSettings，新填寫也不再被要求選飲品');
assert.equal(latest.registrationSettings.token, 'public-registration-token-901', '登入管理端仍可取得私密報名 token');

const scheduleEntryView = registrationAdminView([latest], latest.id, [], true);
assert.match(scheduleEntryView, /← 返回賽事後台/, '從賽事頁進入時提供返回原賽事按鈕');
assert.match(scheduleEntryView, new RegExp(`max=\"${MAX_TOURNAMENT_PLAYERS}\"`), '報名管理畫面沿用共用人數上限');
assert.match(scheduleEntryView, /第一次參賽 · 12345 · 無糖綠茶/, '報名管理總覽直接顯示備註');
assert.doesNotMatch(scheduleEntryView, /飲品統計/, '報名管理不再提供飲品統計');
const navigationEntryView = registrationAdminView([latest], latest.id, [], false);
assert.match(navigationEntryView, /← 選擇其他賽事/, '從上方報名管理進入時提供選擇其他賽事按鈕');

const manuallyClosed = await request('/api/tournaments/901/actions', {
  method: 'POST',
  headers: adminHeaders,
  body: JSON.stringify({ type: 'update_registration_settings', payload: { settings: { enabled: false } }, expectedRevision: 2 }),
});
const manuallyClosedTournament = (await manuallyClosed.json()).tournament;
assert.notEqual(manuallyClosedTournament.registrationSettings.token, tournament.registrationSettings.token, '手動關閉報名會撤銷舊 token');
const revokedPublicPath = await request(publicPath);
assert.equal(revokedPublicPath.status, 404, '撤銷後的舊報名網址會直接失效');

let secureStart = createTournament('開賽撤銷測試', ['A', 'B', 'C', 'D'], 'swiss');
secureStart = updateRegistrationSettings(secureStart, { enabled: true });
const oldStartToken = secureStart.registrationSettings.token;
for (const player of secureStart.players) secureStart = setDraftPlayerCheckedIn(secureStart, player, true);
secureStart = prepareTournamentSchedule(secureStart);
assert.equal(secureStart.registrationSettings.enabled, false);
assert.notEqual(secureStart.registrationSettings.token, oldStartToken, '進入排程時會關閉報名並撤銷舊網址');

console.log('PASS registration flow');

function jsonHeaders(token = '') {
  return { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) };
}

function changed(count) {
  return { success: true, meta: { changes: count } };
}

/** 後端指令同步測試：小型 payload、衝突重試與 ETag 無變更不重繪。 */
const storage = new Map([['spin-admin-token', 'token']]);
globalThis.sessionStorage = {
  getItem: (key) => storage.get(key) || null,
  setItem: (key, value) => storage.set(key, value),
  removeItem: (key) => storage.delete(key),
};

const original = { id: 1, name: '後端指令測試', players: ['A', 'B'], rounds: [], revision: 1 };
const latest = { ...original, revision: 2, remoteMarker: '裁判 A 的更新' };
let listCalls = 0;
let actionCalls = 0;

globalThis.fetch = async (path, options = {}) => {
  if (path === '/api/tournaments' && (!options.method || options.method === 'GET')) {
    listCalls += 1;
    if (listCalls === 1) return response({ tournaments: [original] }, 200, { etag: '"list-v1"' });
    assert(options.headers['If-None-Match'] === '"list-v1"', '輪詢會附帶上一版 ETag');
    return new Response(null, { status: 304, headers: { etag: '"list-v1"' } });
  }
  if (path === '/api/admin/session') return response({ authenticated: true });
  if (path === '/api/tournaments/1/actions' && options.method === 'POST') {
    actionCalls += 1;
    const body = JSON.parse(options.body);
    assert(!('tournament' in body), '前端指令不再上傳完整賽事物件');
    assert(body.type === 'record_match' && body.payload.scoreA === 4, '前端只傳操作類型與必要比分');
    if (actionCalls === 1) return response({ error: '資料已由其他裁判更新。', tournament: latest }, 409);
    assert(body.expectedRevision === 2, '指令衝突後以後端最新版自動重試');
    return response({ tournament: { ...latest, revision: 3, localMarker: '裁判 B 的更新' } });
  }
  throw new Error(`Unexpected request: ${options.method || 'GET'} ${path}`);
};

const { executeTournamentAction, getState, initializeStore, refreshTournaments, subscribe } = await import('../src/data/store.js');
await initializeStore();

let notifications = 0;
const unsubscribe = subscribe(() => { notifications += 1; });
const changed = await refreshTournaments();
assert(changed === false && notifications === 0, '304 回應不解析資料也不觸發畫面重繪');

const saved = await executeTournamentAction(1, 'record_match', { roundIndex: 0, matchIndex: 0, scoreA: 4, scoreB: 2 });
assert(actionCalls === 2, '不同裁判同時操作時安全重試一次');
assert(saved.revision === 3 && saved.remoteMarker && getState().tournaments[0].localMarker, '重試後保留最新後端狀態');
unsubscribe();

console.log('PASS backend action sync and ETag tests');

function response(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`PASS ${message}`);
}

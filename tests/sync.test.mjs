const storage = new Map([['spin-admin-token', 'token']]);
globalThis.sessionStorage = {
  getItem: (key) => storage.get(key) || null,
  setItem: (key, value) => storage.set(key, value),
  removeItem: (key) => storage.delete(key),
};

const original = { id: 1, name: '同步測試', players: ['A', 'B'], rounds: [], revision: 1, stationOne: null, stationTwo: null };
const latest = { ...original, revision: 2, stationOne: '裁判 A 已完成' };
let updateCalls = 0;

globalThis.fetch = async (path, options = {}) => {
  if (path === '/api/tournaments' && (!options.method || options.method === 'GET')) return response({ tournaments: [original] });
  if (path === '/api/admin/session') return response({ authenticated: true });
  if (path === '/api/tournaments/1' && options.method === 'PUT') {
    updateCalls += 1;
    const body = JSON.parse(options.body);
    if (updateCalls === 1) return response({ error: '資料已由其他裁判更新。', tournament: latest }, 409);
    assert(body.expectedRevision === 2, '衝突後使用最新版本重試');
    assert(body.tournament.stationOne === '裁判 A 已完成', '重試保留其他裁判的更新');
    assert(body.tournament.stationTwo === '裁判 B 已完成', '重試合併目前裁判的更新');
    return response({ tournament: { ...body.tournament, revision: 3 } });
  }
  throw new Error(`Unexpected request: ${options.method || 'GET'} ${path}`);
};

const { getState, initializeStore, mutateTournament } = await import('../src/data/store.js');
await initializeStore();
const saved = await mutateTournament(1, (tournament) => ({ ...tournament, stationTwo: '裁判 B 已完成' }), { retryOnConflict: true });

assert(updateCalls === 2, '不同場比賽衝突時自動重試一次');
assert(saved.revision === 3 && getState().tournaments[0].revision === 3, '本機狀態套用伺服器最新版本');
console.log('PASS sync conflict retry');

function response(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`PASS ${message}`);
}

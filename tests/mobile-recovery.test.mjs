/** 行動瀏覽器恢復測試：BFCache／重新上線後立即刷新目前賽事，不必手動重新整理。 */
const storage = new Map();
globalThis.sessionStorage = {
  getItem: (key) => storage.get(key) || null,
  setItem: (key, value) => storage.set(key, value),
  removeItem: (key) => storage.delete(key),
};

globalThis.document = { visibilityState: 'visible' };
const navigatorState = { onLine: true };
Object.defineProperty(globalThis, 'navigator', { value: navigatorState, configurable: true });
const listeners = new Map();
globalThis.window = {
  addEventListener: (name, handler) => listeners.set(name, handler),
};

const original = { id: 1, name: 'Mobile Recovery', players: ['A', 'B'], rounds: [], revision: 1 };
const refreshed = { ...original, revision: 2, resumed: true };
let tournamentReads = 0;

globalThis.fetch = async (path) => {
  if (path === '/api/tournaments') return response({ tournaments: [original] }, 200, { etag: '"list-v1"' });
  if (path === '/api/tournaments/1') {
    tournamentReads += 1;
    return response({ tournament: refreshed }, 200, { etag: '"tournament-v2"' });
  }
  throw new Error(`Unexpected request: GET ${path}`);
};

const store = await import('../src/data/store.js');
await store.initializeStore();
store.selectTournament(1);
const recovery = await import('../src/core/mobile-recovery.js');

assert(listeners.has('pageshow') && listeners.has('online'), '註冊 BFCache 與重新上線恢復事件');
const changed = await recovery.recoverMobileSession();
assert(changed === true && tournamentReads === 1, '恢復時只刷新目前正在看的賽事');
assert(store.getState().tournaments[0].revision === 2 && store.getState().tournaments[0].resumed, '恢復後套用最新賽事版本');

navigatorState.onLine = false;
const skipped = await recovery.recoverMobileSession();
assert(skipped === false && tournamentReads === 1, '仍離線時不建立無效重試要求');

console.log('PASS mobile recovery');

function response(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

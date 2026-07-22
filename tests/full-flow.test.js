const result = document.querySelector('#result');
const records = new Map();
const alerts = [];
let assertions = 0;

location.hash = 'control';
window.scrollTo = () => {};
window.confirm = () => true;
window.alert = (message) => alerts.push(String(message));
window.fetch = mockFetch;

try {
  await import('../src/main.js');

  expectText('主辦方後台', '公開模式顯示主辦方登入頁');
  fill('[name="pin"]', '2468');
  submit('[data-control-login]');
  await waitFor('[data-route="manage"]');
  expectText('管理後台', '輸入 PIN 後可以進入主辦方後台');
  click('[data-route="manage"]');
  await waitFor('[data-tournament-form]');

  fill('[name="name"]', '完整流程測試賽');
  fill('[name="players"]', '旋風\n烈焰\n銀河\n雷霆');
  fill('[name="arenaCount"]', '2');
  submit('[data-tournament-form]');
  await waitFor('[data-action="start-tournament"]');
  expectText('完整流程測試賽', '可以從表單建立賽事並開啟預覽賽程');
  expect(document.querySelector('[data-action="edit-tournament"]'), '開始前顯示編輯賽事按鈕');

  click('[data-action="edit-tournament"]');
  await waitFor('[data-tournament-form]');
  fill('[name="name"]', '完整流程測試賽（已編輯）');
  submit('[data-tournament-form]');
  await waitFor('[data-action="start-tournament"]');
  expectText('完整流程測試賽（已編輯）', '開始前可以儲存賽事修改');

  click('[data-action="randomize-bracket"]');
  await waitFor('[data-action="start-tournament"]');
  expect(records.size === 1, '重新隨機分組後仍只有一場賽事');
  click('[data-action="start-tournament"]');
  await waitFor('.match-card.is-ready');
  expect(!document.querySelector('[data-action="edit-tournament"]'), '賽事開始後鎖定編輯功能');

  await completeReadyMatch(4, 2);
  await forfeitReadyMatch();
  await completeReadyMatch(5, 3);
  await waitFor('.leaderboard');
  expectText('賽事排行榜', '完成全部對戰後顯示排行榜');
  expectText('CHAMPION', '完成賽事後顯示冠軍');
  expect(document.querySelector('[data-replay-round="1"]'), '完成後可以選擇重新比賽');

  click('[data-replay-round="1"]');
  await waitFor('.match-card.is-ready');
  expect(!document.querySelector('.leaderboard'), '重新比賽會清除冠軍與排行榜完成狀態');
  await completeReadyMatch(4, 1);
  await waitFor('.leaderboard');

  await pause();
  click('[data-action="copy-current-tournament"]');
  await waitFor('[data-action="start-tournament"]');
  expectText('（副本）', '複製賽事會建立保留名單的準備中副本');
  expect(records.size === 2, '複製後雲端資料有兩場賽事');
  click('[data-action="start-tournament"]');
  await waitFor('[data-no-show-player]');
  click('[data-no-show-player]');
  await waitFor('.participant-row.is-inactive');
  expectText('退賽判定 4：0', '未出席會讓目前對手以 4 比 0 不戰勝');
  expect(!document.querySelector('[data-restore-player]'), '未出席或退賽後不提供恢復參賽');

  click('[data-action="back-events"]');
  await waitFor('[data-delete-tournament]');
  click('[data-delete-tournament]');
  await waitUntil(() => records.size === 1);
  expect(records.size === 1, '賽事列表可以刪除副本');

  click('[data-route="scoreboard"]');
  await waitFor('[data-scoreboard]');
  click('[data-target="a"][data-value="1"]');
  click('[data-target="a"][data-value="1"]');
  expect(document.querySelector('[data-score="a"]').textContent === '2', '獨立記分板可以加分');
  click('[data-action="undo-score"]');
  expect(document.querySelector('[data-score="a"]').textContent === '1', '獨立記分板可以復原上一步');
  click('[data-action="swap-sides"]');
  expect(document.querySelector('[data-score="b"]').textContent === '1', '獨立記分板可以交換雙方');
  click('[data-action="reset-score"]');
  expect(document.querySelector('[data-score="a"]').textContent === '0' && document.querySelector('[data-score="b"]').textContent === '0', '獨立記分板可以重設比分');
  click('[data-action="logout-admin"]');
  await waitFor('.hero-actions [data-route="control"]');
  expectText('公開模式', '登出後回到公開模式');

  expect(alerts.length === 0, `完整正常流程沒有錯誤提示（${alerts.join('；')}）`);
  result.textContent = `PASS ${assertions} full browser flow`;
} catch (error) {
  result.textContent = `FAIL\n${error.stack}`;
}

async function completeReadyMatch(scoreA, scoreB) {
  click('.match-card.is-ready');
  await waitFor('[data-action="complete-match"]');
  for (let index = 0; index < scoreA; index += 1) click('[data-target="a"][data-value="1"]');
  for (let index = 0; index < scoreB; index += 1) click('[data-target="b"][data-value="1"]');
  click('[data-action="complete-match"]');
  await waitFor('.match-card.is-ready, .leaderboard');
}

async function forfeitReadyMatch() {
  click('.match-card.is-ready');
  await waitFor('[data-forfeit-player]');
  click('[data-forfeit-player]');
  await waitFor('.match-card.is-ready, .leaderboard');
}

function click(selector) {
  const element = document.querySelector(selector);
  if (!element) throw new Error(`找不到可點擊元件：${selector}`);
  element.click();
}

function fill(selector, value) {
  const element = document.querySelector(selector);
  if (!element) throw new Error(`找不到欄位：${selector}`);
  element.value = value;
  element.dispatchEvent(new Event('input', { bubbles: true }));
}

function submit(selector) {
  const form = document.querySelector(selector);
  if (!form) throw new Error(`找不到表單：${selector}`);
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
  assertions += 1;
}

function expectText(text, message) {
  expect(document.querySelector('#app').textContent.includes(text), message);
}

async function waitFor(selector) {
  await waitUntil(() => document.querySelector(selector));
}

async function waitUntil(predicate, timeout = 3000) {
  const started = performance.now();
  while (!predicate()) {
    if (performance.now() - started > timeout) throw new Error('等待畫面更新逾時');
    await pause();
  }
  await pause();
}

function pause() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function mockFetch(input, options = {}) {
  const url = new URL(String(input), location.href);
  const apiIndex = url.pathname.indexOf('/api/');
  const path = apiIndex >= 0 ? url.pathname.slice(apiIndex) : url.pathname;
  const method = options.method || 'GET';
  if (path === '/api/admin/login' && method === 'POST') return json({ token: 'browser-test-token' });
  if (path === '/api/admin/session') return json({ authenticated: true });
  if (path === '/api/tournaments' && method === 'GET') return json({ tournaments: [...records.values()] });
  if (path === '/api/tournaments' && method === 'POST') {
    const { tournament } = JSON.parse(options.body);
    const saved = { ...tournament, revision: 1 };
    records.set(String(saved.id), saved);
    return json({ tournament: saved }, 201);
  }
  const match = path.match(/^\/api\/tournaments\/(.+)$/);
  if (match && method === 'PUT') {
    const id = decodeURIComponent(match[1]);
    const current = records.get(id);
    const { tournament, expectedRevision } = JSON.parse(options.body);
    if (!current || current.revision !== expectedRevision) return json({ error: '資料衝突', tournament: current }, 409);
    const saved = { ...tournament, revision: current.revision + 1 };
    records.set(id, saved);
    return json({ tournament: saved });
  }
  if (match && method === 'DELETE') {
    records.delete(decodeURIComponent(match[1]));
    return json({ success: true });
  }
  throw new Error(`未模擬的 API：${method} ${path}`);
}

function json(body, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
}

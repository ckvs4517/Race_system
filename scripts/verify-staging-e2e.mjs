/**
 * 線上 staging destructive E2E：以真正 UI + Test D1 跑一場 4 人單淘汰流程。
 *
 * 安全限制：scripts/lib/staging-target.mjs 會硬性拒絕任何非 spin-league-test 網域。
 * PIN 只從 STAGING_ADMIN_PIN 環境變數讀取，不寫入程式、報告或 log。
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findChrome, spawnBackground, waitForUrl } from './lib/test-runner.mjs';
import {
  assertE2ETournamentName,
  createE2ETournamentName,
  normalizeStagingUrl,
} from './lib/staging-target.mjs';

const baseUrl = normalizeStagingUrl(process.argv[2] || process.env.STAGING_SITE_URL || 'https://spin-league-test.ckvs4517.chatgpt.site/');
const adminPin = String(process.env.STAGING_ADMIN_PIN || '');
const expectedGitSha = String(process.env.EXPECTED_GIT_SHA || '').trim().toLowerCase();
const artifactsDir = join(process.cwd(), 'artifacts');
const tournamentName = createE2ETournamentName();
const tempPlayer = 'E2E Temp Player';
const report = {
  site: baseUrl.origin,
  expectedGitSha: expectedGitSha || null,
  tournamentName,
  startedAt: new Date().toISOString(),
  status: 'running',
  checks: [],
};

if (!adminPin) throw new Error('缺少 STAGING_ADMIN_PIN。請將測試站管理 PIN 放入 GitHub Actions secret STAGING_ADMIN_PIN。');
if (expectedGitSha && !/^[0-9a-f]{7,40}$/.test(expectedGitSha)) throw new Error('EXPECTED_GIT_SHA 必須是 7～40 位十六進位 Git SHA。');
assertE2ETournamentName(tournamentName);

await mkdir(artifactsDir, { recursive: true });
const before = await listTournaments();
const beforeIds = new Set(before.map((item) => String(item.id)));
let adminToken = '';
let browser = null;
let cdp = null;
let browserProfile = '';
let browserError = '';

try {
  await checkLiveRevision();
  mark('live source revision');

  adminToken = await loginForCleanup();
  mark('staging admin API authentication');

  const chrome = await findChrome();
  if (!chrome) throw new Error('找不到 Chrome/Chromium。可設定 CHROME_PATH。');
  const debugPort = 19227;
  browserProfile = await mkdtemp(join(tmpdir(), 'spin-league-staging-e2e-'));
  browser = spawnBackground(chrome, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--no-first-run',
    '--disable-background-networking',
    `--remote-debugging-port=${debugPort}`,
    '--remote-debugging-address=127.0.0.1',
    `--user-data-dir=${browserProfile}`,
    `${baseUrl.origin}/#home`,
  ]);
  browser.stderr.on('data', (chunk) => { browserError += chunk; });
  await waitForUrl(`http://127.0.0.1:${debugPort}/json/version`, 10_000);
  const targets = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then((response) => response.json());
  const page = targets.find((target) => target.type === 'page' && target.webSocketDebuggerUrl);
  if (!page) throw new Error('找不到 Chrome page debugging target。');
  cdp = await connectCdp(page.webSocketDebuggerUrl);
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');

  const flowResult = await evaluateInPage(browserFlowSource(adminPin, tournamentName, tempPlayer));
  if (!flowResult?.ok) throw new Error(flowResult?.error || '線上瀏覽器流程沒有回傳成功結果。');
  for (const check of flowResult.checks || []) mark(check);
  if (flowResult.alerts?.length) throw new Error(`瀏覽器流程出現 alert：${flowResult.alerts.join('；')}`);

  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.error = String(error?.stack || error);
  await captureFailureScreenshot().catch(() => {});
  throw error;
} finally {
  try {
    if (!adminToken) adminToken = await loginForCleanup();
    await cleanupExactE2ETournament(adminToken, tournamentName);
    mark('E2E tournament cleanup');
  } catch (cleanupError) {
    report.cleanupError = String(cleanupError?.stack || cleanupError);
    if (report.status === 'passed') report.status = 'failed-cleanup';
  }

  try {
    const after = await listTournaments();
    const afterIds = new Set(after.map((item) => String(item.id)));
    const missingExisting = [...beforeIds].filter((id) => !afterIds.has(id));
    if (missingExisting.length) throw new Error(`E2E 後缺少既有測試賽事 ID：${missingExisting.join(', ')}`);
    if (after.some((item) => item.name === tournamentName)) throw new Error('E2E 測試賽事清理後仍存在。');
    mark('pre-existing Test D1 tournaments preserved');
  } catch (integrityError) {
    report.integrityError = String(integrityError?.stack || integrityError);
    if (report.status === 'passed') report.status = 'failed-integrity';
  }

  report.finishedAt = new Date().toISOString();
  await writeFile(join(artifactsDir, 'staging-e2e-report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  cdp?.close();
  browser?.kill('SIGTERM');
  if (browserProfile) await rm(browserProfile, { recursive: true, force: true });
}

if (report.status !== 'passed') {
  if (browserError.trim()) console.error(browserError.trimEnd().slice(-2000));
  throw new Error(`Staging E2E 結束狀態：${report.status}`);
}
console.log(`PASS staging E2E: ${report.checks.length} checks, ${baseUrl.origin}`);

function mark(label) {
  if (!report.checks.includes(label)) report.checks.push(label);
}

async function checkLiveRevision() {
  const response = await fetch(new URL(`/src/core/build-info.js?e2e=${Date.now()}`, baseUrl), {
    headers: { 'cache-control': 'no-cache' },
  });
  if (!response.ok) throw new Error(`build-info.js 回傳 HTTP ${response.status}`);
  const source = await response.text();
  if (!source.includes("const BUILD_VERSION = 'git:")) {
    throw new Error('測試站目前沒有可追溯的 GIT source marker；拒絕 destructive E2E。');
  }
  if (expectedGitSha && !source.toLowerCase().includes(`git:${expectedGitSha}`)) {
    throw new Error(`測試站部署版本不是預期 Git SHA ${expectedGitSha}。`);
  }
}

async function listTournaments() {
  const response = await fetch(new URL(`/api/tournaments?e2e=${Date.now()}`, baseUrl), {
    headers: { accept: 'application/json', 'cache-control': 'no-cache' },
  });
  if (!response.ok) throw new Error(`/api/tournaments 回傳 HTTP ${response.status}`);
  const payload = await response.json();
  if (!Array.isArray(payload.tournaments)) throw new Error('賽事 API 沒有回傳 tournaments 陣列。');
  return payload.tournaments;
}

async function loginForCleanup() {
  const response = await fetch(new URL('/api/admin/login', baseUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pin: adminPin }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.token) throw new Error(payload.error || `管理登入失敗 HTTP ${response.status}`);
  return payload.token;
}

async function cleanupExactE2ETournament(token, exactName) {
  assertE2ETournamentName(exactName);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const tournaments = await listTournaments();
    const targets = tournaments.filter((item) => item.name === exactName);
    if (!targets.length) return;
    for (const tournament of targets) {
      const response = await fetch(new URL(`/api/tournaments/${encodeURIComponent(tournament.id)}?revision=${Number(tournament.revision) || 0}`, baseUrl), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 409 && attempt === 0) continue;
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || `清理 E2E 賽事失敗 HTTP ${response.status}`);
      }
    }
  }
  const remaining = (await listTournaments()).filter((item) => item.name === exactName);
  if (remaining.length) throw new Error('兩次清理後 E2E 賽事仍存在。');
}

async function captureFailureScreenshot() {
  if (!cdp) return;
  const response = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  if (response?.data) {
    await writeFile(join(artifactsDir, 'staging-e2e-failure.png'), Buffer.from(response.data, 'base64'));
  }
}

async function evaluateInPage(expression) {
  const response = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  });
  if (response.exceptionDetails) {
    const description = response.exceptionDetails.exception?.description || response.exceptionDetails.text || 'Runtime.evaluate failed';
    throw new Error(description);
  }
  return response.result?.value;
}

async function connectCdp(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl);
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('連線 Chrome DevTools Protocol 逾時。')), 5000);
    socket.addEventListener('open', () => { clearTimeout(timeout); resolve(); }, { once: true });
    socket.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('Chrome DevTools Protocol WebSocket 連線失敗。')); }, { once: true });
  });

  let sequence = 0;
  const pending = new Map();
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message || 'CDP command failed'));
    else resolve(message.result || {});
  });

  return {
    send(method, params = {}) {
      const id = ++sequence;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
    close() { socket.close(); },
  };
}

function browserFlowSource(pin, e2eName, temporaryPlayer) {
  return `(${browserFlow.toString()})(${JSON.stringify(pin)}, ${JSON.stringify(e2eName)}, ${JSON.stringify(temporaryPlayer)})`;
}

async function browserFlow(pin, e2eName, temporaryPlayer) {
  const checks = [];
  const alerts = [];
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const app = () => document.querySelector('#app');
  const query = (selector) => document.querySelector(selector);
  const record = (label) => checks.push(label);
  const waitUntil = async (predicate, label, timeout = 20_000) => {
    const deadline = Date.now() + timeout;
    let lastError;
    while (Date.now() < deadline) {
      try {
        if (predicate()) { await sleep(150); return; }
      } catch (error) { lastError = error; }
      await sleep(150);
    }
    throw new Error(`等待逾時：${label}${lastError ? ` (${lastError.message})` : ''}`);
  };
  const waitFor = (selector, timeout) => waitUntil(() => query(selector), selector, timeout);
  const click = (selector) => {
    const element = query(selector);
    if (!element) throw new Error(`找不到可點擊元件：${selector}`);
    element.click();
    return element;
  };
  const fill = (selector, value) => {
    const element = query(selector);
    if (!element) throw new Error(`找不到欄位：${selector}`);
    element.value = value;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const submit = (selector) => {
    const form = query(selector);
    if (!form) throw new Error(`找不到表單：${selector}`);
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  };
  const textIncludes = (value) => app()?.textContent?.includes(value);
  const buttonForTournamentName = (selector) => [...document.querySelectorAll(selector)]
    .find((element) => element.dataset.tournamentName === e2eName);

  window.confirm = () => true;
  window.alert = (message) => alerts.push(String(message));

  try {
    await waitUntil(() => app()?.textContent?.includes('SPIN LEAGUE') || document.body.textContent.includes('SPIN LEAGUE'), 'app bootstrap');
    record('site UI bootstrap');

    location.hash = 'control';
    await waitFor('[data-control-login]');
    fill('[data-control-login] [name="pin"]', pin);
    submit('[data-control-login]');
    await waitUntil(() => query('[data-route="manage"]') && document.body.textContent.includes('控制模式'), 'admin login');
    record('admin UI login');

    click('[data-route="manage"]');
    await waitFor('[data-tournament-form]');
    fill('[data-tournament-form] [name="name"]', e2eName);
    fill('[data-tournament-form] [name="format"]', 'single_elimination');
    fill('[data-tournament-form] [name="arenaCount"]', '1');
    fill('[data-tournament-form] [name="players"]', 'E2E Alpha\\nE2E Bravo\\nE2E Charlie\\nE2E Delta');
    submit('[data-tournament-form]');
    await waitUntil(() => textIncludes(e2eName) && query('[data-action="prepare-tournament-schedule"]'), 'create tournament');
    record('create 4-player tournament through UI');

    click('[data-open-add-player]');
    await waitFor('[data-add-draft-player-form]');
    fill('[data-add-draft-player-form] [name="playerName"]', temporaryPlayer);
    submit('[data-add-draft-player-form]');
    await waitUntil(() => [...document.querySelectorAll('[data-remove-player-select]')].some((element) => element.dataset.removePlayerSelect === temporaryPlayer), 'add player');
    record('add draft player');

    click('[data-enter-remove-mode]');
    const removeChoice = [...document.querySelectorAll('[data-remove-player-select]')].find((element) => element.dataset.removePlayerSelect === temporaryPlayer);
    if (!removeChoice) throw new Error('新增後找不到待移除的 E2E 選手。');
    removeChoice.click();
    click('[data-confirm-remove-players]');
    await waitUntil(() => ![...document.querySelectorAll('[data-remove-player-select]')].some((element) => element.dataset.removePlayerSelect === temporaryPlayer), 'remove player');
    record('remove draft player');

    let checked = 0;
    while (checked < 4) {
      const input = query('[data-check-in-player]:not(:checked)');
      if (!input) break;
      input.click();
      await waitUntil(() => !document.contains(input), 'check-in save');
      checked += 1;
    }
    await waitUntil(() => textIncludes('已報到 4／報名 4 人'), 'all players checked in');
    record('check in all players');

    click('[data-action="prepare-tournament-schedule"]');
    await waitFor('[data-action="randomize-schedule"]');
    click('[data-action="randomize-schedule"]');
    await waitFor('[data-opening-pairings-form]');
    record('generate opening pairings');
    click('[data-action="confirm-tournament-schedule"]');
    await waitFor('.match-card.is-ready');
    record('confirm schedule and start tournament');

    const completeReadyMatch = async (scoreA = 4, scoreB = 1) => {
      const ready = query('.match-card.is-ready');
      if (!ready) return false;
      ready.click();
      await waitFor('[data-scoreboard].match-mode');
      for (let index = 0; index < scoreB; index += 1) click('[data-target="b"][data-value="1"]');
      for (let index = 0; index < scoreA; index += 1) click('[data-target="a"][data-value="1"]');
      click('[data-action="complete-match"]');
      await waitUntil(() => query('.match-card.is-ready') || query('.champion-banner') || textIncludes('已完成'), 'save match result');
      return true;
    };

    for (let index = 0; index < 6 && !query('.champion-banner'); index += 1) {
      const completed = await completeReadyMatch(4, index % 2);
      if (!completed) break;
    }
    await waitUntil(() => query('.champion-banner') && query('.leaderboard'), 'tournament completion');
    record('score full elimination tournament');
    record('leaderboard and champion render');

    const replay = query('[data-replay-round]');
    if (!replay) throw new Error('完成賽事後找不到重新比賽按鈕。');
    replay.click();
    await waitFor('.match-card.is-ready');
    record('replay completed match');
    for (let index = 0; index < 3 && !query('.champion-banner'); index += 1) {
      const completed = await completeReadyMatch(4, 1);
      if (!completed) break;
    }
    await waitUntil(() => query('.champion-banner'), 'replay completion');

    click('[data-action="back-events"]');
    await waitFor('[data-tournament-list]');
    click('[data-tournament-list-tab="history"]');
    await waitUntil(() => [...document.querySelectorAll('[data-history-row]')].some((row) => row.textContent.includes(e2eName)), 'history listing');
    record('completed tournament appears in history');

    const deleteButton = buttonForTournamentName('[data-delete-tournament]');
    if (!deleteButton) throw new Error('歷史列表找不到 E2E 賽事刪除按鈕。');
    deleteButton.click();
    await waitUntil(() => !buttonForTournamentName('[data-delete-tournament]'), 'UI delete tournament');
    record('delete E2E tournament through UI');

    location.hash = 'scoreboard';
    await waitFor('[data-scoreboard]');
    click('[data-target="a"][data-value="1"]');
    click('[data-action="undo-score"]');
    click('[data-action="reset-score"]');
    record('standalone scoreboard interaction');

    location.hash = 'guide';
    await waitUntil(() => textIncludes('六步完成一場賽事'), 'guide route');
    record('guide route render');

    location.hash = 'speedometer';
    await waitUntil(() => app()?.textContent?.length > 50 && location.hash === '#speedometer', 'speedometer route');
    record('speedometer route render');

    return { ok: true, checks, alerts };
  } catch (error) {
    return { ok: false, checks, alerts, error: String(error?.stack || error) };
  }
}

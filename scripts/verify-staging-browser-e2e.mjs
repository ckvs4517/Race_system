/**
 * Browser-only staging E2E for spin-league-test.
 * All staging HTTP requests are executed inside Chrome because ChatGPT Sites may
 * reject server-side Node fetch requests from CI runners with HTTP 401.
 */
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findChrome, spawnBackground } from './lib/test-runner.mjs';
import { assertE2ETournamentName, createE2ETournamentName, normalizeStagingUrl } from './lib/staging-target.mjs';

const baseUrl = normalizeStagingUrl(process.argv[2] || process.env.STAGING_SITE_URL || 'https://spin-league-test.ckvs4517.chatgpt.site/');
const adminPin = String(process.env.STAGING_ADMIN_PIN || '');
const expectedGitSha = String(process.env.EXPECTED_GIT_SHA || '').trim().toLowerCase();
const tournamentName = createE2ETournamentName();
const temporaryPlayer = 'E2E Temp Player';
const artifactsDir = join(process.cwd(), 'artifacts');
const report = {
  site: baseUrl.origin,
  expectedGitSha: expectedGitSha || null,
  tournamentName,
  startedAt: new Date().toISOString(),
  status: 'running',
  checks: [],
};

if (!adminPin) throw new Error('缺少 STAGING_ADMIN_PIN。');
if (expectedGitSha && !/^[0-9a-f]{7,40}$/.test(expectedGitSha)) throw new Error('EXPECTED_GIT_SHA 必須是 7～40 位十六進位 Git SHA。');
assertE2ETournamentName(tournamentName);
await mkdir(artifactsDir, { recursive: true });

let browser = null;
let cdp = null;
let profile = '';
let browserError = '';
let beforeIds = [];
let cleanupToken = '';
let primaryError = null;

try {
  const chrome = await findChrome();
  if (!chrome) throw new Error('找不到 Chrome/Chromium。');

  profile = await mkdtemp(join(tmpdir(), 'spin-league-staging-browser-e2e-'));
  browser = spawnBackground(chrome, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--no-first-run',
    '--disable-background-networking',
    '--remote-debugging-port=0',
    '--remote-debugging-address=127.0.0.1',
    `--user-data-dir=${profile}`,
    `${baseUrl.origin}/#home`,
  ]);
  browser.stderr.on('data', (chunk) => { browserError += chunk; });

  const debugPort = await waitForChromeDevTools(profile, browser, () => browserError);
  const targetsResponse = await fetch(`http://127.0.0.1:${debugPort}/json/list`, { cache: 'no-store' });
  if (!targetsResponse.ok) throw new Error(`Chrome DevTools target list 回傳 HTTP ${targetsResponse.status}`);
  const targets = await targetsResponse.json();
  const page = targets.find((target) => target.type === 'page' && target.webSocketDebuggerUrl);
  if (!page) throw new Error('找不到 Chrome page debugging target。');

  cdp = await connectCdp(page.webSocketDebuggerUrl);
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');

  await waitForSiteBootstrap();
  mark('site UI bootstrap');

  const revision = await checkRevisionInBrowser();
  report.liveGitSha = revision;
  mark('live source revision');

  const before = await listTournamentsInBrowser();
  beforeIds = before.map((item) => String(item.id));
  mark('staging tournament API readable in browser');

  cleanupToken = await loginApiInBrowser(adminPin);
  mark('staging admin API authentication in browser');

  const flow = await evaluate(browserFlowSource(adminPin, tournamentName, temporaryPlayer));
  if (!flow?.ok) throw new Error(flow?.error || '線上瀏覽器流程失敗。');
  for (const check of flow.checks || []) mark(check);
  if (flow.alerts?.length) throw new Error(`瀏覽器流程出現 alert：${flow.alerts.join('；')}`);

  report.status = 'passed';
} catch (error) {
  primaryError = error;
  report.status = 'failed';
  report.error = String(error?.stack || error);
  await captureScreenshot().catch(() => {});
} finally {
  if (cdp) {
    try {
      if (!cleanupToken) cleanupToken = await loginApiInBrowser(adminPin);
      await cleanupTournamentInBrowser(cleanupToken, tournamentName);
      mark('E2E tournament cleanup');
    } catch (error) {
      report.cleanupError = String(error?.stack || error);
      if (report.status === 'passed') report.status = 'failed-cleanup';
    }

    try {
      const after = await listTournamentsInBrowser();
      const afterIds = new Set(after.map((item) => String(item.id)));
      const missing = beforeIds.filter((id) => !afterIds.has(id));
      if (missing.length) throw new Error(`E2E 後缺少既有測試賽事 ID：${missing.join(', ')}`);
      if (after.some((item) => item.name === tournamentName)) throw new Error('E2E 賽事清理後仍存在。');
      mark('pre-existing Test D1 tournaments preserved');
    } catch (error) {
      report.integrityError = String(error?.stack || error);
      if (report.status === 'passed') report.status = 'failed-integrity';
    }
  }

  report.finishedAt = new Date().toISOString();
  await writeFile(join(artifactsDir, 'staging-e2e-report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  cdp?.close();
  browser?.kill('SIGTERM');
  if (profile) await cleanupBrowserProfile(profile);
}

if (report.status !== 'passed') {
  if (browserError.trim()) console.error(browserError.trimEnd().slice(-2000));
  throw primaryError || new Error(`Staging E2E 結束狀態：${report.status}`);
}
console.log(`PASS staging E2E: ${report.checks.length} checks, ${baseUrl.origin}`);

function mark(label) {
  if (!report.checks.includes(label)) report.checks.push(label);
}

async function waitForChromeDevTools(profileDir, child, getStderr) {
  const activePortFile = join(profileDir, 'DevToolsActivePort');
  const deadline = Date.now() + 15_000;
  let lastError = '';
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      const stderr = String(getStderr?.() || '').trim();
      throw new Error(`Chrome 在 DevTools 啟動前退出（code ${child.exitCode}）。${stderr ? ` stderr: ${stderr.slice(-1500)}` : ''}`);
    }
    try {
      const text = await readFile(activePortFile, 'utf8');
      const [portText] = text.trim().split(/\r?\n/);
      const port = Number(portText);
      if (Number.isInteger(port) && port > 0 && port <= 65535) return port;
      lastError = `DevToolsActivePort 內容無效：${JSON.stringify(text)}`;
    } catch (error) {
      lastError = error?.message || String(error);
    }
    await delay(100);
  }
  const stderr = String(getStderr?.() || '').trim();
  throw new Error(`Chrome DevTools 在 15 秒內未就緒。${lastError ? ` ${lastError}` : ''}${stderr ? ` stderr: ${stderr.slice(-1500)}` : ''}`);
}

async function waitForSiteBootstrap() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const state = await evaluate(`(() => ({
      href: location.href,
      title: document.title,
      body: document.body?.innerText?.slice(0, 500) || '',
      hasApp: Boolean(document.querySelector('#app')),
    }))()`);
    const accessText = `${state?.title || ''} ${state?.body || ''}`;
    if (/Sign in required|Continue with ChatGPT|You're almost in|You’re almost in/i.test(accessText)) {
      throw new Error('ChatGPT Sites 存取保護擋住 CI。請將 spin-league-test 的 Site access 設為 Public 後再執行 Staging E2E。');
    }
    if (state?.hasApp && /Spin League/i.test(accessText)) return;
    await delay(250);
  }
  const state = await evaluate(`(() => ({ title: document.title, body: document.body?.innerText?.slice(0, 1000) || '' }))()`);
  throw new Error(`測試站無法在 Chrome 載入：${JSON.stringify(state)}`);
}

async function checkRevisionInBrowser() {
  const result = await evaluate(`(async () => {
    const response = await fetch('/src/core/build-info.js?e2e=' + Date.now(), { cache: 'no-store' });
    return { ok: response.ok, status: response.status, text: await response.text() };
  })()`);
  if (!result?.ok) throw new Error(`build-info.js 回傳 HTTP ${result?.status ?? 'unknown'}`);
  const match = String(result.text || '').match(/BUILD_VERSION\s*=\s*['\"]git:([0-9a-f]{40})/i);
  if (!match) throw new Error('測試站沒有可追溯的 GIT source marker；拒絕 destructive E2E。');
  const liveSha = match[1].toLowerCase();
  if (expectedGitSha && !liveSha.startsWith(expectedGitSha)) {
    throw new Error(`測試站部署版本 ${liveSha.slice(0, 7)} 不是預期 ${expectedGitSha}。`);
  }
  return liveSha;
}

async function listTournamentsInBrowser() {
  const result = await evaluate(`(async () => {
    const response = await fetch('/api/tournaments?e2e=' + Date.now(), {
      headers: { accept: 'application/json', 'cache-control': 'no-cache' },
      cache: 'no-store',
    });
    const payload = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, payload };
  })()`);
  if (!result?.ok) throw new Error(`/api/tournaments 回傳 HTTP ${result?.status ?? 'unknown'}`);
  if (!Array.isArray(result.payload?.tournaments)) throw new Error('賽事 API 沒有回傳 tournaments 陣列。');
  return result.payload.tournaments;
}

async function loginApiInBrowser(pin) {
  const result = await evaluate(`(async (pin) => {
    const response = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pin }),
    });
    const payload = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, payload };
  })(${JSON.stringify(pin)})`);
  if (!result?.ok || !result.payload?.token) throw new Error(result?.payload?.error || `管理登入失敗 HTTP ${result?.status ?? 'unknown'}`);
  return result.payload.token;
}

async function cleanupTournamentInBrowser(token, exactName) {
  assertE2ETournamentName(exactName);
  const result = await evaluate(`(async (token, exactName) => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const listResponse = await fetch('/api/tournaments?cleanup=' + Date.now(), { cache: 'no-store' });
      const listPayload = await listResponse.json().catch(() => ({}));
      if (!listResponse.ok) return { ok: false, error: 'list HTTP ' + listResponse.status };
      const targets = (listPayload.tournaments || []).filter((item) => item.name === exactName);
      if (!targets.length) return { ok: true };
      let retry = false;
      for (const item of targets) {
        const response = await fetch('/api/tournaments/' + encodeURIComponent(item.id) + '?revision=' + (Number(item.revision) || 0), {
          method: 'DELETE',
          headers: { Authorization: 'Bearer ' + token },
        });
        if (response.status === 409 && attempt === 0) { retry = true; continue; }
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          return { ok: false, error: payload.error || ('delete HTTP ' + response.status) };
        }
      }
      if (!retry) return { ok: true };
    }
    return { ok: false, error: '兩次清理後 E2E 賽事仍存在。' };
  })(${JSON.stringify(token)}, ${JSON.stringify(exactName)})`);
  if (!result?.ok) throw new Error(result?.error || '清理 E2E 賽事失敗。');
}

async function captureScreenshot() {
  if (!cdp) return;
  const result = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  if (result?.data) await writeFile(join(artifactsDir, 'staging-e2e-failure.png'), Buffer.from(result.data, 'base64'));
}

function browserFlowSource(pin, e2eName, tempPlayer) {
  return `(${browserFlow.toString()})(${JSON.stringify(pin)}, ${JSON.stringify(e2eName)}, ${JSON.stringify(tempPlayer)})`;
}

async function browserFlow(pin, e2eName, tempPlayer) {
  const checks = [];
  const alerts = [];
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const app = () => document.querySelector('#app');
  const q = (selector) => document.querySelector(selector);
  const record = (label) => checks.push(label);
  const waitUntil = async (predicate, label, timeout = 20_000) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (predicate()) { await sleep(150); return; }
      await sleep(150);
    }
    throw new Error(`等待逾時：${label}`);
  };
  const waitFor = (selector, timeout) => waitUntil(() => q(selector), selector, timeout);
  const click = (selector) => {
    const element = q(selector);
    if (!element) throw new Error(`找不到可點擊元件：${selector}`);
    element.click();
    return element;
  };
  const fill = (selector, value) => {
    const element = q(selector);
    if (!element) throw new Error(`找不到欄位：${selector}`);
    element.value = value;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const submit = (selector) => {
    const form = q(selector);
    if (!form) throw new Error(`找不到表單：${selector}`);
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  };
  const textIncludes = (text) => app()?.textContent?.includes(text);

  window.confirm = () => true;
  window.alert = (message) => alerts.push(String(message));

  try {
    location.hash = 'control';
    await waitFor('[data-control-login]');
    fill('[data-control-login] [name="pin"]', pin);
    submit('[data-control-login]');
    await waitUntil(() => q('[data-route="manage"]') && document.body.textContent.includes('管理後台'), 'admin UI login');
    record('admin UI login');

    click('[data-route="manage"]');
    await waitFor('[data-tournament-form]');
    fill('[data-tournament-form] [name="name"]', e2eName);
    fill('[data-tournament-form] [name="format"]', 'single_elimination');
    fill('[data-tournament-form] [name="arenaCount"]', '1');
    fill('[data-tournament-form] [name="players"]', 'E2E Alpha\nE2E Bravo\nE2E Charlie\nE2E Delta');
    submit('[data-tournament-form]');
    await waitUntil(() => textIncludes(e2eName) && q('[data-action="prepare-tournament-schedule"]'), 'create tournament');
    record('create 4-player tournament through UI');

    click('[data-open-add-player]');
    await waitFor('[data-add-draft-player-form]');
    fill('[data-add-draft-player-form] [name="playerName"]', tempPlayer);
    submit('[data-add-draft-player-form]');
    await waitUntil(() => [...document.querySelectorAll('[data-remove-player-select]')].some((el) => el.dataset.removePlayerSelect === tempPlayer), 'add player');
    record('add draft player');

    click('[data-enter-remove-mode]');
    const removeChoice = [...document.querySelectorAll('[data-remove-player-select]')].find((el) => el.dataset.removePlayerSelect === tempPlayer);
    if (!removeChoice) throw new Error('找不到 E2E 暫時選手。');
    removeChoice.click();
    click('[data-confirm-remove-players]');
    await waitUntil(() => ![...document.querySelectorAll('[data-remove-player-select]')].some((el) => el.dataset.removePlayerSelect === tempPlayer), 'remove player');
    record('remove draft player');

    while (q('[data-check-in-player]:not(:checked)')) {
      const input = q('[data-check-in-player]:not(:checked)');
      input.click();
      // 報到控制器會保留同一個 input；只有雲端寫入成功後才解除 disabled。
      await waitUntil(() => input.checked && !input.disabled, 'check-in save');
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

    const completeReady = async (scoreB = 0) => {
      const ready = q('.match-card.is-ready');
      if (!ready) return false;
      ready.click();
      await waitFor('[data-scoreboard].match-mode');
      for (let i = 0; i < scoreB; i += 1) click('[data-target="b"][data-value="1"]');
      for (let i = 0; i < 4; i += 1) click('[data-target="a"][data-value="1"]');
      click('[data-action="complete-match"]');
      await waitUntil(() => q('.match-card.is-ready') || q('.champion-banner') || textIncludes('已完成'), 'save match');
      return true;
    };

    for (let i = 0; i < 6 && !q('.champion-banner'); i += 1) {
      if (!await completeReady(i % 2)) break;
    }
    await waitUntil(() => q('.champion-banner') && q('.leaderboard'), 'tournament completion');
    record('score full elimination tournament');
    record('leaderboard and champion render');

    const replay = q('[data-replay-round]');
    if (!replay) throw new Error('找不到重新比賽按鈕。');
    replay.click();
    await waitFor('.match-card.is-ready');
    record('replay completed match');
    for (let i = 0; i < 3 && !q('.champion-banner'); i += 1) {
      if (!await completeReady(1)) break;
    }
    await waitUntil(() => q('.champion-banner'), 'replay completion');

    click('[data-action="back-events"]');
    await waitFor('[data-tournament-list]');
    click('[data-tournament-list-tab="history"]');
    await waitUntil(() => [...document.querySelectorAll('[data-history-row]')].some((row) => row.textContent.includes(e2eName)), 'history listing');
    record('completed tournament appears in history');

    const deleteButton = [...document.querySelectorAll('[data-delete-tournament]')].find((el) => el.dataset.tournamentName === e2eName);
    if (!deleteButton) throw new Error('找不到 E2E 賽事刪除按鈕。');
    deleteButton.click();
    await waitUntil(() => ![...document.querySelectorAll('[data-delete-tournament]')].some((el) => el.dataset.tournamentName === e2eName), 'delete tournament');
    record('delete E2E tournament through UI');

    location.hash = 'scoreboard';
    await waitFor('[data-scoreboard]');
    click('[data-target="a"][data-value="1"]');
    click('[data-action="undo-score"]');
    click('[data-action="reset-score"]');
    record('standalone scoreboard interaction');

    location.hash = 'guide';
    await waitUntil(() => app()?.textContent?.length > 50 && location.hash === '#guide', 'guide route');
    record('guide route render');

    location.hash = 'speedometer';
    await waitUntil(() => app()?.textContent?.length > 50 && location.hash === '#speedometer', 'speedometer route');
    record('speedometer route render');

    return { ok: true, checks, alerts };
  } catch (error) {
    return { ok: false, checks, alerts, error: String(error?.stack || error) };
  }
}

async function evaluate(expression) {
  if (!cdp) throw new Error('Chrome CDP 尚未連線。');
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
    const waiter = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(message.error.message || 'CDP command failed'));
    else waiter.resolve(message.result || {});
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

async function cleanupBrowserProfile(path) {
  await delay(300);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      await rm(path, { recursive: true, force: true });
      return;
    } catch (error) {
      if (!['ENOTEMPTY', 'EBUSY', 'EPERM'].includes(error?.code)) throw error;
      await delay(250 * (attempt + 1));
    }
  }
  // Chrome shutdown can leave transient lock files; profile cleanup must not mask the E2E result.
  await rm(path, { recursive: true, force: true }).catch(() => {});
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

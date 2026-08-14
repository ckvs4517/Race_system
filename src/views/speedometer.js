/** 單人測速器：支援 SpinLab 與 BeyBattle Pass 的即時 SP、趨勢與匯出。 */
import { BattlePassConnection } from '../data/battle-pass.js';
import { SpinLabConnection } from '../data/spinlab.js';
import { ScreenWakeLock } from '../data/screen-wake-lock.js';
import { calculateShootStats } from '../domain/battle-pass.js';
import { exportSpeedAnalysisAsPng, exportSpeedReportAsPdf } from '../export/speed-report.js';
import { speedLineChartSvg, speedProfileChartSvg } from '../ui/speed-chart.js';
import { pageHeader } from '../ui/shell.js';

const STORAGE_KEY = 'spin-league-speedometer-session-v1';
const WAKE_LOCK_SETTING_KEY = 'spin-league-speedometer-keep-display-awake-v1';
const meterState = restoreSession();
let connection = null;
let screenWakeLock = null;

export function speedometerView() {
  const stats = calculateShootStats(meterState.readings);
  const latest = meterState.readings.at(-1);
  const latestSpinLab = latest?.source === 'spinlab' ? latest : null;
  const top = stats.top;
  const support = BattlePassConnection.isSupported();
  const status = statusPresentation(meterState.status, support);
  const display = displayPresentation(getWakeLockState());
  const delta = latest && stats.count > 1 ? latest.shootPower - stats.average : null;

  return `<section class="section-wrap page-section speedometer-page" data-speedometer-root>
    ${pageHeader('PERFORMANCE LAB', '轉速表', '連接 SpinLab 或 BeyBattle Pass，即時記錄每次發射數據，並輸出本次工作階段的分析報告。')}

    <div class="speed-connect-panel ${meterState.status === 'connected' ? 'is-connected' : ''}">
      <div class="speed-connect-statuses">
        <div class="speed-connect-device">
          <span class="speed-status-dot ${status.className}"></span>
          <div><b>${escapeHtml(status.label)}</b><span>${escapeHtml(deviceLine())}</span></div>
        </div>
        <div class="speed-connect-device speed-display-device">
          <span class="speed-status-dot ${display.className}"></span>
          <div><b>DISPLAY</b><span>${escapeHtml(display.label)}</span></div>
        </div>
      </div>
      <div class="speed-connect-actions">
        <button class="button button-primary" data-speed-action="connect-spinlab" ${isConnectionBusy() ? 'disabled' : ''}>${connectionButtonLabel('spinlab')}</button>
        <button class="button button-secondary" data-speed-action="connect-battle-pass" ${isConnectionBusy() ? 'disabled' : ''}>${connectionButtonLabel('battle-pass')}</button>
        <button class="button button-secondary" data-speed-action="disconnect" ${meterState.status !== 'connected' ? 'disabled' : ''}>中斷連線</button>
        <button class="button button-secondary" data-speed-action="new-session">新工作階段</button>
        <label class="speed-wake-toggle"><input type="checkbox" data-speed-keep-display-awake ${meterState.keepDisplayAwake ? 'checked' : ''}><span>測速時保持螢幕開啟</span></label>
      </div>
    </div>

    ${!support ? `<div class="speed-browser-warning"><b>此瀏覽器目前無法使用 Web Bluetooth。</b><span>請使用支援 Web Bluetooth 的 Chrome 或 Edge，並以 HTTPS 或 localhost 開啟網站。</span></div>` : ''}
    ${!display.supported ? `<div class="speed-browser-warning"><b>此瀏覽器不支援防止螢幕自動熄滅。</b><span>測速時請調整裝置的自動鎖定設定；藍牙測速仍可正常使用。</span></div>` : ''}
    ${meterState.error ? `<div class="speed-browser-warning is-error"><b>連線訊息</b><span>${escapeHtml(meterState.error)}</span></div>` : ''}

    <div class="speed-live-grid">
      <article class="speed-live-card ${latest ? 'has-reading' : ''}">
        <div class="speed-card-head"><span>${latestSpinLab ? 'LIVE REFERENCE SP' : 'LIVE SHOOT POWER'}</span><i>${meterState.status === 'connected' ? '● LIVE' : '○ STANDBY'}</i></div>
        <div class="speed-live-value"><strong>${latest ? number(latest.shootPower) : '—'}</strong><b>SP</b></div>
        <div class="speed-live-meta"><span>${latest ? `第 ${stats.count} 次發射 · ${formatTime(latest.at)}` : '等待測速器發射資料'}</span>${delta === null ? '' : `<em class="${delta >= 0 ? 'is-up' : 'is-down'}">${delta >= 0 ? '+' : ''}${number(delta)} vs AVG</em>`}</div>
        ${latestSpinLab ? spinLabMetrics(latestSpinLab) : ''}
        <p>${latestSpinLab ? 'SpinLab 顯示依目前校準公式換算的 Reference SP，並保留估算範圍與原始拉繩指標；它不是官方 Battle Pass SP。' : 'Battle Pass 顯示裝置原生 Shoot Power (SP)；SP 並非陀螺離開發射器後的真實 RPM。'}</p>
      </article>

      <aside class="speed-stats-card">
        <div class="speed-card-head"><span>SESSION SUMMARY</span><i>${stats.count} SHOTS</i></div>
        <div class="speed-stats-grid">
          <div class="is-peak"><span>最高</span><strong>${stats.count ? number(stats.max) : '—'}</strong><b>SP</b></div>
          <div><span>平均</span><strong>${stats.count ? number(stats.average) : '—'}</strong><b>SP</b></div>
          <div><span>最低</span><strong>${stats.count ? number(stats.min) : '—'}</strong><b>SP</b></div>
          <div><span>筆數</span><strong>${stats.count || '—'}</strong><b>SHOTS</b></div>
        </div>
      </aside>
    </div>

    <div class="speed-analysis-grid">
      <article class="speed-panel speed-chart-panel">
        <div class="speed-panel-heading"><div><span>POWER TREND</span><h2>發射趨勢</h2></div><b>${stats.count ? `${number(stats.average)} AVG` : 'WAITING DATA'}</b></div>
        <div class="speed-chart-wrap">${speedLineChartSvg(meterState.readings, { width: 820, height: 300 })}</div>
      </article>
      <article class="speed-panel speed-ranking-panel">
        <div class="speed-panel-heading"><div><span>TOP READINGS</span><h2>最高紀錄</h2></div></div>
        <div class="speed-ranking-list">${Array.from({ length: 5 }, (_, index) => `<div class="${index === 0 ? 'is-first' : ''}"><span>#${index + 1}</span><strong>${top[index] ? number(top[index]) : '—'}</strong><b>SP</b></div>`).join('')}</div>
      </article>
    </div>

    <article class="speed-panel speed-profile-panel">
      <div class="speed-panel-heading"><div><span>LATEST SHOOT PROFILE</span><h2>${latestSpinLab ? '本次 SpinLab 原始指標' : '本次發射偵測點'}</h2></div><b>${latestSpinLab ? `${number(latestSpinLab.transitions)} EDGES` : latest?.profile?.length ? `${latest.profile.length} POINTS` : 'WAITING DATA'}</b></div>
      <p>${latestSpinLab ? '顯示本次有效 Pull 區段的摘要；Raw edge timestamp 目前仍保留在裝置序列埠 Log。' : '顯示 Battle Pass 在最近一次發射中回傳的所有偵測點。'}</p>
      ${latestSpinLab ? spinLabDetailPanel(latestSpinLab) : `<div class="speed-chart-wrap">${speedProfileChartSvg(latest?.profile || [], { width: 1120, height: 280 })}</div>`}
    </article>

    <article class="speed-history-panel">
      <div class="speed-history-heading">
        <div><span>SESSION LOG</span><h2>本次發射紀錄</h2><p>${escapeHtml(sessionRange())}</p></div>
        <div class="speed-export-actions">
          <button class="button button-secondary" data-speed-action="export-image" ${stats.count ? '' : 'disabled'}>${meterState.exporting === 'image' ? '產生中…' : '匯出 4:5 分析圖'}</button>
          <button class="button button-primary" data-speed-action="export-pdf" ${stats.count ? '' : 'disabled'}>${meterState.exporting === 'pdf' ? '產生中…' : '匯出 PDF 報告'}</button>
        </div>
      </div>
      <div class="speed-history-table-wrap">
        <div class="speed-history-row speed-history-table-head"><span>#</span><span>時間</span><span>SHOOT POWER</span><span>裝置資料</span></div>
        ${meterState.readings.length ? [...meterState.readings].reverse().map((reading, reversedIndex) => {
          const index = meterState.readings.length - reversedIndex;
          return `<div class="speed-history-row"><span>${String(index).padStart(2, '0')}</span><span>${escapeHtml(formatTime(reading.at))}</span><strong>${number(reading.shootPower)} <b>SP</b></strong><span>${reading.source === 'spinlab' ? `#${number(reading.shotId)} · ${number(reading.pullPeakRpm)} RPM` : Number.isFinite(Number(reading.totalShootCounter)) ? number(reading.totalShootCounter) : '—'}</span></div>`;
        }).join('') : '<div class="speed-history-empty">連線後發射第一顆陀螺，資料會自動出現在這裡。</div>'}
      </div>
    </article>
  </section>`;
}

export function bindSpeedometer(root) {
  ensureScreenWakeLock();
  root.querySelector('[data-speed-action="connect-spinlab"]')?.addEventListener('click', () => connectDevice('spinlab'));
  root.querySelector('[data-speed-action="connect-battle-pass"]')?.addEventListener('click', () => connectDevice('battle-pass'));
  root.querySelector('[data-speed-action="disconnect"]')?.addEventListener('click', disconnectBattlePass);
  root.querySelector('[data-speed-action="new-session"]')?.addEventListener('click', startNewSession);
  root.querySelector('[data-speed-action="export-pdf"]')?.addEventListener('click', () => exportSession('pdf'));
  root.querySelector('[data-speed-action="export-image"]')?.addEventListener('click', () => exportSession('image'));
  root.querySelector('[data-speed-keep-display-awake]')?.addEventListener('change', (event) => {
    meterState.keepDisplayAwake = event.currentTarget.checked;
    persistWakeLockPreference();
    ensureScreenWakeLock().setEnabled(meterState.keepDisplayAwake);
  });
}

/** 離開轉速表頁面時只中斷 BLE；保留本次紀錄供返回後匯出。 */
export function leaveSpeedometer() {
  const activeWakeLock = screenWakeLock;
  screenWakeLock = null;
  activeWakeLock?.cleanup().catch(() => {});
  if (connection?.connected) connection.disconnect().catch(() => {});
}

async function connectDevice(kind) {
  meterState.error = '';
  if (connection && meterState.deviceKind !== kind) {
    try { await connection.disconnect(); } catch {}
    connection = null;
  }
  meterState.deviceKind = kind;
  meterState.deviceName = '';
  meterState.deviceUid = '';
  ensureConnection(kind);
  try {
    await connection.connect();
    if (!meterState.startedAt) meterState.startedAt = new Date().toISOString();
    persistSession();
  } catch (error) {
    meterState.status = 'disconnected';
    meterState.error = friendlyBluetoothError(error);
    refreshPage();
  }
}

async function disconnectBattlePass() {
  await screenWakeLock?.setContext({ connected: false, sessionActive: false });
  if (!connection) return;
  try { await connection.disconnect(); } catch (error) { meterState.error = error.message; }
  refreshPage();
}

function ensureConnection(kind = meterState.deviceKind || 'spinlab') {
  if (connection) return;
  const ConnectionClass = kind === 'battle-pass' ? BattlePassConnection : SpinLabConnection;
  connection = new ConnectionClass({
    onStatus(status) {
      meterState.status = status;
      if (status === 'connected' && !meterState.startedAt) meterState.startedAt = new Date().toISOString();
      syncWakeLockContext();
      persistSession();
      refreshPage();
    },
    onDevice(info) {
      if (info.name) meterState.deviceName = info.name;
      if (info.browserDeviceId) meterState.browserDeviceId = info.browserDeviceId;
      if (info.deviceUid) meterState.deviceUid = info.deviceUid;
      persistSession();
      refreshPage();
    },
    onReading(reading) {
      const duplicate = meterState.readings.at(-1)?.totalShootCounter === reading.totalShootCounter && meterState.readings.at(-1)?.shootPower === reading.shootPower;
      if (duplicate) return;
      meterState.readings.push({
        source: reading.source || 'battle-pass',
        shootPower: reading.shootPower,
        totalShootCounter: reading.totalShootCounter,
        listIndex: reading.listIndex,
        profile: reading.profile,
        shotId: reading.shotId,
        referenceSpLow: reading.referenceSpLow,
        referenceSpHigh: reading.referenceSpHigh,
        transitions: reading.transitions,
        pullActiveTimeMs: reading.pullActiveTimeMs,
        reversalGapMs: reading.reversalGapMs,
        pullPeakRpm: reading.pullPeakRpm,
        bothEdges: reading.bothEdges,
        rewindAnomaly: reading.rewindAnomaly,
        alternationError: reading.alternationError,
        reversalType: reading.reversalType,
        at: new Date().toISOString(),
      });
      meterState.deviceUid ||= reading.deviceUid || '';
      meterState.error = '';
      persistSession();
      refreshPage();
    },
    onInvalidReading(reading) {
      const reason = { 'invalid-short': '有效 Pull 資料太短', 'no-reversal': '找不到 Pull／回捲分界', overflow: 'Raw edge buffer 已滿' }[reading.status] || reading.status;
      meterState.error = `SpinLab 已略過 shot #${reading.shotId}：${reason}。`;
      refreshPage();
    },
    onError(error) {
      meterState.error = error.message;
      refreshPage();
    },
  });
}

async function startNewSession() {
  if (meterState.readings.length && !confirm('確定要開始新的工作階段嗎？目前畫面上的發射紀錄會被清除。')) return;
  // Starting a new measurement finishes the old session. Release first, then
  // request again only when the new connected session is ready.
  await screenWakeLock?.releaseWakeLock();
  meterState.readings = [];
  meterState.startedAt = meterState.status === 'connected' ? new Date().toISOString() : '';
  meterState.error = '';
  syncWakeLockContext();
  persistSession();
  refreshPage();
}

async function exportSession(type) {
  if (!meterState.readings.length || meterState.exporting) return;
  meterState.exporting = type;
  meterState.error = '';
  refreshPage();
  const session = snapshotSession();
  try {
    if (type === 'pdf') await exportSpeedReportAsPdf(session);
    else await exportSpeedAnalysisAsPng(session);
  } catch (error) {
    meterState.error = error.message || '匯出失敗，請再試一次。';
  } finally {
    meterState.exporting = '';
    refreshPage();
  }
}

function refreshPage() {
  const current = document.querySelector('[data-speedometer-root]');
  if (!current) return;
  const wrapper = document.createElement('div');
  wrapper.innerHTML = speedometerView();
  const replacement = wrapper.firstElementChild;
  current.replaceWith(replacement);
  bindSpeedometer(document);
}

function snapshotSession() {
  return {
    startedAt: meterState.startedAt || new Date().toISOString(),
    deviceName: meterState.deviceName,
    deviceUid: meterState.deviceUid,
    deviceKind: meterState.deviceKind,
    readings: meterState.readings.map((reading) => ({ ...reading, profile: [...(reading.profile || [])] })),
  };
}

function restoreSession() {
  const fallback = { status: 'idle', deviceKind: 'spinlab', deviceName: '', browserDeviceId: '', deviceUid: '', startedAt: '', readings: [], error: '', exporting: '', keepDisplayAwake: restoreWakeLockPreference() };
  if (typeof sessionStorage === 'undefined') return fallback;
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null');
    if (!saved || !Array.isArray(saved.readings)) return fallback;
    return { ...fallback, ...saved, keepDisplayAwake: restoreWakeLockPreference(), status: 'disconnected', exporting: '', error: '' };
  } catch {
    return fallback;
  }
}

function ensureScreenWakeLock() {
  if (screenWakeLock) return screenWakeLock;
  screenWakeLock = new ScreenWakeLock({
    onChange() {
      // Screen policy can change without a BLE event (for example, background
      // suspension). Re-render only the Speedometer UI; never reset its session.
      refreshPage();
    },
  });
  screenWakeLock.setEnabled(meterState.keepDisplayAwake);
  syncWakeLockContext();
  return screenWakeLock;
}

function syncWakeLockContext() {
  if (!screenWakeLock) return;
  screenWakeLock.setContext({
    connected: meterState.status === 'connected',
    sessionActive: meterState.status === 'connected' && Boolean(meterState.startedAt),
  });
}

function getWakeLockState() {
  if (screenWakeLock) return screenWakeLock.getState();
  const supported = typeof navigator !== 'undefined' && 'wakeLock' in navigator && Boolean(navigator.wakeLock?.request);
  return { supported, enabled: meterState.keepDisplayAwake, active: false, error: null };
}

function restoreWakeLockPreference() {
  if (typeof localStorage === 'undefined') return true;
  try { return localStorage.getItem(WAKE_LOCK_SETTING_KEY) !== 'false'; } catch { return true; }
}

function persistWakeLockPreference() {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(WAKE_LOCK_SETTING_KEY, meterState.keepDisplayAwake ? 'true' : 'false'); } catch {}
}

function persistSession() {
  if (typeof sessionStorage === 'undefined') return;
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...meterState, exporting: '', error: '' })); } catch {}
}

function statusPresentation(status, support) {
  if (!support) return { label: 'BROWSER NOT SUPPORTED', className: 'is-error' };
  const device = meterState.deviceKind === 'battle-pass' ? 'BATTLE PASS' : 'SPINLAB';
  if (status === 'connected') return { label: `${device} CONNECTED`, className: 'is-online' };
  if (status === 'requesting') return { label: `SELECT ${device}`, className: 'is-waiting' };
  if (status === 'connecting') return { label: 'CONNECTING', className: 'is-waiting' };
  return { label: 'SPEEDOMETER STANDBY', className: '' };
}

function displayPresentation(state) {
  if (!state.supported) return { label: '不支援防熄屏', className: '' };
  if (state.active) return { label: '螢幕保持開啟', className: 'is-online' };
  if (state.error) return { label: '無法保持螢幕開啟', className: 'is-error' };
  return { label: '一般模式', className: '' };
}

function deviceLine() {
  const parts = [meterState.deviceName || '尚未連接裝置'];
  if (meterState.deviceUid) parts.push(`${meterState.deviceKind === 'battle-pass' ? 'PASS ' : ''}${meterState.deviceUid}`);
  return parts.join(' · ');
}

function sessionRange() {
  if (!meterState.startedAt) return '尚未開始工作階段';
  return `開始於 ${new Date(meterState.startedAt).toLocaleString('zh-TW', { hour12: false })}`;
}

function friendlyBluetoothError(error) {
  if (error?.name === 'NotFoundError') return '未選擇裝置、找不到測速器，或裝置選擇視窗已取消。';
  if (error?.name === 'SecurityError') return 'Web Bluetooth 需要 HTTPS／localhost，且必須由使用者按下連線按鈕啟動。';
  return error?.message || '藍牙測速器連線失敗。';
}

function isConnectionBusy() { return ['connected', 'connecting', 'requesting'].includes(meterState.status); }
function connectionButtonLabel(kind) {
  if (meterState.deviceKind === kind && meterState.status === 'requesting') return '選擇裝置中…';
  if (meterState.deviceKind === kind && meterState.status === 'connecting') return '連線中…';
  return kind === 'spinlab' ? '連接 SpinLab' : '連接 Battle Pass';
}
function spinLabMetrics(reading) {
  return `<div class="speed-spinlab-metrics"><span><b>${number(reading.referenceSpLow)}–${number(reading.referenceSpHigh)}</b><small>REFERENCE SP RANGE</small></span><span><b>${number(reading.pullPeakRpm)}</b><small>PEAK RPM</small></span><span><b>${formatDecimal(reading.pullActiveTimeMs)}</b><small>PULL ms</small></span></div>`;
}
function spinLabDetailPanel(reading) {
  return `<div class="speed-spinlab-detail">
    <div><span>Reference SP</span><strong>${number(reading.shootPower)}</strong><small>${number(reading.referenceSpLow)}–${number(reading.referenceSpHigh)}</small></div>
    <div><span>有效 edges</span><strong>${number(reading.transitions)}</strong><small>${reading.bothEdges ? '雙邊緣模式' : '單邊緣模式'}</small></div>
    <div><span>Pull 時間</span><strong>${formatDecimal(reading.pullActiveTimeMs)}</strong><small>ms</small></div>
    <div><span>Reversal gap</span><strong>${formatDecimal(reading.reversalGapMs)}</strong><small>ms · ${escapeHtml(reading.reversalType)}</small></div>
    <div><span>Pull peak</span><strong>${number(reading.pullPeakRpm)}</strong><small>RPM</small></div>
    <div><span>訊號狀態</span><strong>${reading.rewindAnomaly || reading.alternationError ? 'CHECK' : 'OK'}</strong><small>${reading.rewindAnomaly ? '回捲異常' : reading.alternationError ? 'edge 交替異常' : '未偵測到異常'}</small></div>
  </div>`;
}

function formatTime(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? '—' : date.toLocaleTimeString('zh-TW', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
function number(value) { return Math.round(Number(value) || 0).toLocaleString('en-US'); }
function formatDecimal(value) { return Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 1 }); }
function escapeHtml(value) { return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;'); }

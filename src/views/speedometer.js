/** 單人 Battle Pass 轉速表：即時 SP、工作階段紀錄、趨勢與匯出。 */
import { BattlePassConnection } from '../data/battle-pass.js';
import { calculateShootStats } from '../domain/battle-pass.js';
import { exportSpeedAnalysisAsPng, exportSpeedReportAsPdf } from '../export/speed-report.js';
import { speedLineChartSvg } from '../ui/speed-chart.js';
import { pageHeader } from '../ui/shell.js';

const STORAGE_KEY = 'spin-league-speedometer-session-v1';
const meterState = restoreSession();
let connection = null;

export function speedometerView() {
  const stats = calculateShootStats(meterState.readings);
  const latest = meterState.readings.at(-1);
  const top = stats.top;
  const support = BattlePassConnection.isSupported();
  const status = statusPresentation(meterState.status, support);
  const delta = latest && stats.count > 1 ? latest.shootPower - stats.average : null;

  return `<section class="section-wrap page-section speedometer-page" data-speedometer-root>
    ${pageHeader('PERFORMANCE LAB', '轉速表', '連接 BeyBattle Pass，即時記錄每次發射的 Shoot Power，並輸出本次工作階段的分析報告。')}

    <div class="speed-connect-panel ${meterState.status === 'connected' ? 'is-connected' : ''}">
      <div class="speed-connect-device">
        <span class="speed-status-dot ${status.className}"></span>
        <div><b>${escapeHtml(status.label)}</b><span>${escapeHtml(deviceLine())}</span></div>
      </div>
      <div class="speed-connect-actions">
        <button class="button button-primary" data-speed-action="connect" ${meterState.status === 'connected' || meterState.status === 'connecting' || meterState.status === 'requesting' ? 'disabled' : ''}>${meterState.status === 'requesting' ? '選擇裝置中…' : meterState.status === 'connecting' ? '連線中…' : '連接 Battle Pass'}</button>
        <button class="button button-secondary" data-speed-action="disconnect" ${meterState.status !== 'connected' ? 'disabled' : ''}>中斷連線</button>
        <button class="button button-secondary" data-speed-action="new-session">新工作階段</button>
      </div>
    </div>

    ${!support ? `<div class="speed-browser-warning"><b>此瀏覽器目前無法使用 Web Bluetooth。</b><span>請使用支援 Web Bluetooth 的 Chrome，並以 HTTPS 或 localhost 開啟網站。</span></div>` : ''}
    ${meterState.error ? `<div class="speed-browser-warning is-error"><b>連線訊息</b><span>${escapeHtml(meterState.error)}</span></div>` : ''}

    <div class="speed-live-grid">
      <article class="speed-live-card ${latest ? 'has-reading' : ''}">
        <div class="speed-card-head"><span>LIVE SHOOT POWER</span><i>${meterState.status === 'connected' ? '● LIVE' : '○ STANDBY'}</i></div>
        <div class="speed-live-value"><strong>${latest ? number(latest.shootPower) : '—'}</strong><b>SP</b></div>
        <div class="speed-live-meta"><span>${latest ? `第 ${stats.count} 次發射 · ${formatTime(latest.at)}` : '等待 Battle Pass 發射資料'}</span>${delta === null ? '' : `<em class="${delta >= 0 ? 'is-up' : 'is-down'}">${delta >= 0 ? '+' : ''}${number(delta)} vs AVG</em>`}</div>
        <p>「轉速表」以 Battle Pass 的原生 Shoot Power (SP) 顯示；SP 並非陀螺離開發射器後的真實 RPM。</p>
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

    <article class="speed-history-panel">
      <div class="speed-history-heading">
        <div><span>SESSION LOG</span><h2>本次發射紀錄</h2><p>${escapeHtml(sessionRange())}</p></div>
        <div class="speed-export-actions">
          <button class="button button-secondary" data-speed-action="export-image" ${stats.count ? '' : 'disabled'}>${meterState.exporting === 'image' ? '產生中…' : '匯出 4:5 分析圖'}</button>
          <button class="button button-primary" data-speed-action="export-pdf" ${stats.count ? '' : 'disabled'}>${meterState.exporting === 'pdf' ? '產生中…' : '匯出 PDF 報告'}</button>
        </div>
      </div>
      <div class="speed-history-table-wrap">
        <div class="speed-history-row speed-history-table-head"><span>#</span><span>時間</span><span>SHOOT POWER</span><span>裝置累積次數</span></div>
        ${meterState.readings.length ? [...meterState.readings].reverse().map((reading, reversedIndex) => {
          const index = meterState.readings.length - reversedIndex;
          return `<div class="speed-history-row"><span>${String(index).padStart(2, '0')}</span><span>${escapeHtml(formatTime(reading.at))}</span><strong>${number(reading.shootPower)} <b>SP</b></strong><span>${Number.isFinite(Number(reading.totalShootCounter)) ? number(reading.totalShootCounter) : '—'}</span></div>`;
        }).join('') : '<div class="speed-history-empty">連線後發射第一顆陀螺，資料會自動出現在這裡。</div>'}
      </div>
    </article>
  </section>`;
}

export function bindSpeedometer(root) {
  root.querySelector('[data-speed-action="connect"]')?.addEventListener('click', connectBattlePass);
  root.querySelector('[data-speed-action="disconnect"]')?.addEventListener('click', disconnectBattlePass);
  root.querySelector('[data-speed-action="new-session"]')?.addEventListener('click', startNewSession);
  root.querySelector('[data-speed-action="export-pdf"]')?.addEventListener('click', () => exportSession('pdf'));
  root.querySelector('[data-speed-action="export-image"]')?.addEventListener('click', () => exportSession('image'));
}

/** 離開轉速表頁面時只中斷 BLE；保留本次紀錄供返回後匯出。 */
export function leaveSpeedometer() {
  if (!connection?.connected) return;
  connection.disconnect().catch(() => {});
}

async function connectBattlePass() {
  meterState.error = '';
  ensureConnection();
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
  if (!connection) return;
  try { await connection.disconnect(); } catch (error) { meterState.error = error.message; }
  refreshPage();
}

function ensureConnection() {
  if (connection) return;
  connection = new BattlePassConnection({
    onStatus(status) {
      meterState.status = status;
      if (status === 'connected' && !meterState.startedAt) meterState.startedAt = new Date().toISOString();
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
        shootPower: reading.shootPower,
        totalShootCounter: reading.totalShootCounter,
        listIndex: reading.listIndex,
        profile: reading.profile,
        at: new Date().toISOString(),
      });
      meterState.deviceUid ||= reading.deviceUid || '';
      meterState.error = '';
      persistSession();
      refreshPage();
    },
    onError(error) {
      meterState.error = error.message;
      refreshPage();
    },
  });
}

function startNewSession() {
  if (meterState.readings.length && !confirm('確定要開始新的工作階段嗎？目前畫面上的發射紀錄會被清除。')) return;
  meterState.readings = [];
  meterState.startedAt = meterState.status === 'connected' ? new Date().toISOString() : '';
  meterState.error = '';
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
    readings: meterState.readings.map((reading) => ({ ...reading, profile: [...(reading.profile || [])] })),
  };
}

function restoreSession() {
  const fallback = { status: 'idle', deviceName: '', browserDeviceId: '', deviceUid: '', startedAt: '', readings: [], error: '', exporting: '' };
  if (typeof sessionStorage === 'undefined') return fallback;
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null');
    if (!saved || !Array.isArray(saved.readings)) return fallback;
    return { ...fallback, ...saved, status: 'disconnected', exporting: '', error: '' };
  } catch {
    return fallback;
  }
}

function persistSession() {
  if (typeof sessionStorage === 'undefined') return;
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...meterState, exporting: '', error: '' })); } catch {}
}

function statusPresentation(status, support) {
  if (!support) return { label: 'BROWSER NOT SUPPORTED', className: 'is-error' };
  if (status === 'connected') return { label: 'BATTLE PASS CONNECTED', className: 'is-online' };
  if (status === 'requesting') return { label: 'SELECT BATTLE PASS', className: 'is-waiting' };
  if (status === 'connecting') return { label: 'CONNECTING', className: 'is-waiting' };
  return { label: 'BATTLE PASS STANDBY', className: '' };
}

function deviceLine() {
  const parts = [meterState.deviceName || '尚未連接裝置'];
  if (meterState.deviceUid) parts.push(`PASS ${meterState.deviceUid}`);
  return parts.join(' · ');
}

function sessionRange() {
  if (!meterState.startedAt) return '尚未開始工作階段';
  return `開始於 ${new Date(meterState.startedAt).toLocaleString('zh-TW', { hour12: false })}`;
}

function friendlyBluetoothError(error) {
  if (error?.name === 'NotFoundError') return '未選擇 Battle Pass，或裝置選擇視窗已取消。';
  if (error?.name === 'SecurityError') return 'Web Bluetooth 需要 HTTPS／localhost，且必須由使用者按下連線按鈕啟動。';
  return error?.message || 'Battle Pass 連線失敗。';
}

function formatTime(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? '—' : date.toLocaleTimeString('zh-TW', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
function number(value) { return Math.round(Number(value) || 0).toLocaleString('en-US'); }
function escapeHtml(value) { return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;'); }

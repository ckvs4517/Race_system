// 沿用專案既有 html-to-image browser build，不新增 runtime dependency。
import '../../node_modules/html-to-image/dist/html-to-image.js';
import { calculateShootStats } from '../domain/battle-pass.js';
import { speedLineChartSvg } from '../ui/speed-chart.js';
import { buildPdfBytesFromJpegs } from './jpeg-pdf.js';
import { deliverBlob } from './file-delivery.js';

const PDF_WIDTH = 1080;
const PDF_HEIGHT = 1528;
const CARD_WIDTH = 1080;
const CARD_HEIGHT = 1350;

export async function exportSpeedReportAsPdf(session) {
  validateSession(session);
  const stats = calculateShootStats(session.readings);
  const layer = document.createElement('div');
  layer.className = 'speed-report-export-layer';
  layer.innerHTML = reportPages(session, stats);
  document.body.append(layer);
  try {
    await document.fonts?.ready;
    await nextFrame();
    const pages = [...layer.querySelectorAll('[data-speed-report-page]')];
    const jpegPages = [];
    for (const page of pages) {
      const dataUrl = await globalThis.htmlToImage.toJpeg(page, {
        width: PDF_WIDTH,
        height: PDF_HEIGHT,
        canvasWidth: PDF_WIDTH,
        canvasHeight: PDF_HEIGHT,
        pixelRatio: 1,
        quality: .94,
        cacheBust: false,
        backgroundColor: '#080a0d',
      });
      jpegPages.push(new Uint8Array(await (await fetch(dataUrl)).arrayBuffer()));
    }
    const pdfBytes = buildPdfBytesFromJpegs(jpegPages, PDF_WIDTH, PDF_HEIGHT);
    downloadBlob(new Blob([pdfBytes], { type: 'application/pdf' }), `${fileStem(session)}-轉速報告.pdf`);
  } finally {
    layer.remove();
  }
}

export async function exportSpeedAnalysisAsPng(session) {
  validateSession(session);
  const stats = calculateShootStats(session.readings);
  const layer = document.createElement('div');
  layer.className = 'speed-report-export-layer';
  layer.innerHTML = analysisCard(session, stats);
  document.body.append(layer);
  try {
    await document.fonts?.ready;
    await nextFrame();
    const card = layer.querySelector('[data-speed-analysis-card]');
    const blob = await globalThis.htmlToImage.toBlob(card, {
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      canvasWidth: CARD_WIDTH,
      canvasHeight: CARD_HEIGHT,
      pixelRatio: 1,
      cacheBust: false,
      backgroundColor: '#080a0d',
    });
    if (!blob) throw new Error('分析圖產生失敗，請再試一次。');
    downloadBlob(blob, `${fileStem(session)}-轉速分析.png`);
  } finally {
    layer.remove();
  }
}

function reportPages(session, stats) {
  const listChunks = chunk(session.readings, 24);
  const pages = [reportOverviewPage(session, stats, 1, listChunks.length + 1)];
  listChunks.forEach((readings, index) => pages.push(reportListPage(session, readings, index * 24, index + 2, listChunks.length + 1)));
  return pages.join('');
}

function reportOverviewPage(session, stats, page, totalPages) {
  const top = stats.top;
  const spinLab = isSpinLabSession(session);
  return `<article class="speed-report-page speed-report-overview" data-speed-report-page>
    ${reportMasthead('PERFORMANCE REPORT', '轉速分析報告', session, page, totalPages)}
    <section class="speed-report-hero">
      <div><span>SESSION PEAK</span><strong>${num(stats.max)}</strong><b>SP</b></div>
      <div class="speed-report-summary">
        <div><span>平均</span><b>${num(stats.average)}</b></div><div><span>最低</span><b>${num(stats.min)}</b></div><div><span>發射次數</span><b>${stats.count}</b></div>
      </div>
    </section>
    <section class="speed-report-chart"><div class="speed-report-section-title"><span>POWER TREND</span><b>本次工作階段趨勢</b></div>${speedLineChartSvg(session.readings, { width: 930, height: 340 })}</section>
    <section class="speed-report-ranking"><div class="speed-report-section-title"><span>TOP READINGS</span><b>最高紀錄</b></div><div class="speed-report-top-grid">${Array.from({ length: 5 }, (_, index) => `<div class="${index === 0 ? 'is-first' : ''}"><span>#${index + 1}</span><b>${top[index] ? num(top[index]) : '—'}</b><i>SP</i></div>`).join('')}</div></section>
    <p class="speed-report-note">${spinLab ? 'SpinLab 數值為依目前校準公式換算的 Reference SP，並非官方 Battle Pass SP；本報告保留裝置回傳的估算結果。' : 'Battle Pass 原生量測值為 Shoot Power (SP)，不是陀螺離開發射器後的真實 RPM。本報告僅整理本工作階段收到的 Battle Pass 資料。'}</p>
  </article>`;
}

function reportListPage(session, readings, startIndex, page, totalPages) {
  return `<article class="speed-report-page speed-report-list-page" data-speed-report-page>
    ${reportMasthead('SESSION LOG', '完整發射紀錄', session, page, totalPages)}
    <section class="speed-report-log-heading"><span>#</span><span>時間</span><span>SHOOT POWER</span><span>裝置資料</span></section>
    <section class="speed-report-log">${readings.map((reading, index) => `<div><span>${String(startIndex + index + 1).padStart(2, '0')}</span><span>${escapeHtml(formatDateTime(reading.at))}</span><strong>${num(reading.shootPower)} <i>SP</i></strong><span>${reading.source === 'spinlab' ? `#${num(reading.shotId)} · ${num(reading.pullPeakRpm)} RPM` : Number.isFinite(Number(reading.totalShootCounter)) ? num(reading.totalShootCounter) : '—'}</span></div>`).join('')}</section>
    <div class="speed-report-list-footer"><span>工作階段開始：${escapeHtml(formatDateTime(session.startedAt))}</span><span>共 ${session.readings.length} 筆資料</span></div>
  </article>`;
}

function reportMasthead(kicker, title, session, page, totalPages) {
  const spinLab = isSpinLabSession(session);
  return `<header class="speed-report-masthead"><div><span>${kicker}</span><h1>SPIN <em>LEAGUE</em></h1><h2>${title}</h2></div><div class="speed-report-meta"><b>${escapeHtml(session.deviceName || (spinLab ? 'SPINLAB' : 'BEYBATTLE PASS'))}</b><span>${spinLab ? 'REFERENCE SP' : `PASS ID ${escapeHtml(session.deviceUid || '尚未取得')}`}</span><span>${escapeHtml(formatDateTime(session.startedAt))}</span><i>${page} / ${totalPages}</i></div></header>`;
}

function analysisCard(session, stats) {
  const top = stats.top;
  const spinLab = isSpinLabSession(session);
  return `<article class="speed-analysis-card" data-speed-analysis-card>
    <header><div><span>SPIN LEAGUE / SPEEDOMETER</span><h1>SHOOT POWER<br><em>ANALYSIS</em></h1></div><div class="speed-analysis-session">${escapeHtml(formatShortDate(session.startedAt))}<br>${stats.count} SHOTS</div></header>
    <section class="speed-analysis-peak"><span>SESSION PEAK</span><strong>${num(stats.max)}</strong><b>SP</b></section>
    <section class="speed-analysis-top"><div><span>RANK</span><b>TOP READINGS</b></div>${[1, 2, 3, 4].map((index) => `<p><i>#${index + 1}</i><strong>${top[index] ? num(top[index]) : '—'}</strong><span>SP</span></p>`).join('')}</section>
    <section class="speed-analysis-trend"><div><span>POWER TREND</span><b>${num(stats.average)} AVG</b></div>${speedLineChartSvg(session.readings, { width: 940, height: 330 })}</section>
    <footer><span>${escapeHtml(spinLab ? session.deviceName || 'SPINLAB · REFERENCE SP' : session.deviceUid ? `PASS ${session.deviceUid}` : session.deviceName || 'BEYBATTLE PASS')}</span><b>PLAY · TRACK · COMPETE</b></footer>
  </article>`;
}

function validateSession(session) {
  if (!session?.readings?.length) throw new Error('目前沒有可匯出的 Shoot Power 資料。');
  if (!globalThis.htmlToImage) throw new Error('匯出元件尚未載入，請重新整理頁面後再試。');
}

function fileStem(session) {
  const date = new Date(session.startedAt || Date.now());
  const stamp = Number.isNaN(date.getTime()) ? 'session' : `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}-${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}`;
  return `Spin-League-${stamp}`;
}

function isSpinLabSession(session) { return session?.deviceKind === 'spinlab' || session?.readings?.some((reading) => reading.source === 'spinlab'); }

function chunk(items, size) { const result = []; for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size)); return result; }
function num(value) { return Math.round(Number(value) || 0).toLocaleString('en-US'); }
function formatDateTime(value) { const date = new Date(value || Date.now()); return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('zh-TW', { hour12: false }); }
function formatShortDate(value) { const date = new Date(value || Date.now()); return Number.isNaN(date.getTime()) ? 'SESSION' : date.toLocaleDateString('zh-TW'); }
function escapeHtml(value) { return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;'); }
function nextFrame() { return new Promise((resolve) => requestAnimationFrame(() => resolve())); }
function ascii(value) { return new TextEncoder().encode(value); }
function concatBytes(...chunks) { const length = chunks.reduce((total, chunk) => total + chunk.length, 0); const result = new Uint8Array(length); let offset = 0; chunks.forEach((chunk) => { result.set(chunk, offset); offset += chunk.length; }); return result; }
function downloadBlob(blob, filename) { return deliverBlob(blob, filename); }

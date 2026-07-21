import { pageHeader } from '../ui/shell.js';

const BACKUP_FORMAT = 'spin-league-backup';
const BACKUP_VERSION = 1;

export function dataManagementView(tournaments) {
  const completedMatches = tournaments.reduce((total, tournament) => total + (tournament.rounds || []).reduce((roundTotal, round) => roundTotal + (round.matches || []).filter((match) => match.status === '已完成').length, 0), 0);
  const players = tournaments.reduce((total, tournament) => total + (tournament.players?.length || 0), 0);
  const disabled = tournaments.length ? '' : 'disabled';
  const overviewRows = tournaments.map((tournament) => {
    const matches = (tournament.rounds || []).flatMap((round) => round.matches || []);
    const completed = matches.filter((match) => match.status === '已完成').length;
    return `<div class="data-overview-row"><strong>${escapeText(tournament.name)}</strong><span>${tournament.players?.length || 0} 人</span><span>${matches.length} 場</span><span>${completed} 場</span><span>${escapeText(tournament.status || '準備中')}</span><span class="${tournament.champion ? '' : 'data-muted'}">${escapeText(tournament.champion || '尚未產生')}</span></div>`;
  }).join('');

  return `<section class="section-wrap page-section">
    ${pageHeader('DATA MANAGEMENT', '資料管理', '備份完整賽事、匯出 Excel 報表，或從既有備份還原雲端資料。', '<button class="button button-secondary" data-route="control">← 返回後台</button>')}
    <div class="data-summary">
      <div><b>${tournaments.length}</b><span>場賽事</span></div>
      <div><b>${players}</b><span>參賽人次</span></div>
      <div><b>${completedMatches}</b><span>已完成比賽</span></div>
      <div><b>雲端</b><span>目前儲存位置</span></div>
    </div>
    <section class="data-overview">
      <div class="data-overview-heading"><div><span class="data-card-label">ONE ROW = ONE TOURNAMENT</span><h2>賽事總覽</h2></div><span>這裡每一列才代表一場賽事</span></div>
      <div class="data-overview-scroll"><div class="data-overview-row data-overview-header"><span>賽事名稱</span><span>參賽者</span><span>對戰數</span><span>已完成</span><span>狀態</span><span>冠軍</span></div>${overviewRows || '<div class="data-overview-empty">目前沒有賽事資料</div>'}</div>
    </section>
    <div class="data-grid">
      <article class="data-card"><span class="data-card-label">FULL BACKUP</span><h2>完整 JSON 備份</h2><p>包含所有賽事、名單、種子、賽程、比分、統計與冠軍資料，可供日後完整還原。</p><button class="button button-primary" data-action="export-json" ${disabled}>下載完整備份</button></article>
      <article class="data-card"><span class="data-card-label">EXCEL REPORT</span><h2>CSV 表格</h2><p>依用途分成兩份，避免把重複出現的賽事名稱誤認為多場賽事。</p><div class="data-export-actions"><button class="button button-primary" data-action="export-overview-csv" ${disabled}>下載賽事總覽 CSV</button><small>一列代表一場賽事</small><button class="button button-secondary" data-action="export-matches-csv" ${disabled}>下載對戰明細 CSV</button><small>一列代表一場選手對戰；同一賽事名稱會重複</small></div></article>
      <article class="data-card data-card-warning"><span class="data-card-label">RESTORE</span><h2>從備份還原</h2><p>選擇先前匯出的 Spin League JSON。驗證成功並再次確認後，將取代目前的全部雲端賽事。</p><input type="file" accept="application/json,.json" data-backup-file hidden><button class="button button-secondary" data-action="import-json">選擇備份檔案</button></article>
    </div>
    <div class="data-notice"><b>安全提醒</b><span>建議每次大型賽事結束後下載一份完整 JSON 備份。匯入前也先匯出現況，方便需要時復原。</span></div>
  </section>`;
}

export function bindDataManagement(root, tournaments, { onImport }) {
  root.querySelector('[data-action="export-json"]')?.addEventListener('click', () => {
    download(`spin-league-backup-${dateStamp()}.json`, JSON.stringify(createBackup(tournaments), null, 2), 'application/json');
  });
  root.querySelector('[data-action="export-overview-csv"]')?.addEventListener('click', () => {
    download(`spin-league-tournaments-${dateStamp()}.csv`, `\ufeff${createOverviewCsv(tournaments)}`, 'text/csv;charset=utf-8');
  });
  root.querySelector('[data-action="export-matches-csv"]')?.addEventListener('click', () => {
    download(`spin-league-matches-${dateStamp()}.csv`, `\ufeff${createCsv(tournaments)}`, 'text/csv;charset=utf-8');
  });

  const fileInput = root.querySelector('[data-backup-file]');
  root.querySelector('[data-action="import-json"]')?.addEventListener('click', () => fileInput.click());
  fileInput?.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      const backup = parseBackup(await file.text());
      if (!confirm(`備份中有 ${backup.tournaments.length} 場賽事。\n\n確定要取代目前全部 ${tournaments.length} 場雲端賽事嗎？此動作無法直接復原。`)) return;
      onImport(backup.tournaments);
    } catch (error) {
      alert(error.message);
    } finally {
      fileInput.value = '';
    }
  });
}

export function createBackup(tournaments, exportedAt = new Date().toISOString()) {
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt, tournaments: structuredClone(tournaments) };
}

export function parseBackup(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('這不是有效的 JSON 檔案。'); }
  if (data?.format !== BACKUP_FORMAT || data?.version !== BACKUP_VERSION || !Array.isArray(data.tournaments)) throw new Error('這不是有效的 Spin League 備份檔案。');
  if (data.tournaments.length > 200) throw new Error('備份包含過多賽事，無法匯入。');
  data.tournaments.forEach((tournament, index) => {
    if (!tournament || !Number.isFinite(Number(tournament.id)) || typeof tournament.name !== 'string' || !Array.isArray(tournament.players) || tournament.players.length < 2 || tournament.players.length > 32) {
      throw new Error(`第 ${index + 1} 場賽事的資料格式不正確。`);
    }
  });
  return data;
}

export function createCsv(tournaments) {
  const rows = [['賽事名稱', '賽事狀態', '建立日期', '輪次', '比賽編號', '選手 A', '選手 B', '選手 A 比分', '選手 B 比分', '勝者', '比賽狀態']];
  tournaments.forEach((tournament) => {
    const rounds = tournament.rounds || [];
    if (!rounds.length) rows.push([tournament.name, tournament.status, tournament.created, '', '', '', '', '', '', tournament.champion || '', '尚無賽程']);
    rounds.forEach((round, roundIndex) => (round.matches || []).forEach((match, matchIndex) => rows.push([
      tournament.name, tournament.status, tournament.created, round.name || `第 ${roundIndex + 1} 輪`, matchIndex + 1,
      match.playerA, match.playerB, match.scoreA ?? '', match.scoreB ?? '', match.winner ?? '', match.status,
    ])));
  });
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}

export function createOverviewCsv(tournaments) {
  const rows = [['賽事名稱', '賽事狀態', '建立日期', '參賽者人數', '對戰總數', '已完成對戰', '冠軍', '參賽者名單']];
  tournaments.forEach((tournament) => {
    const matches = (tournament.rounds || []).flatMap((round) => round.matches || []);
    rows.push([
      tournament.name, tournament.status, tournament.created, tournament.players?.length || 0, matches.length,
      matches.filter((match) => match.status === '已完成').length, tournament.champion || '', (tournament.players || []).join('、'),
    ]);
  });
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}

function csvCell(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

function escapeText(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function download(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function dateStamp() {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
}

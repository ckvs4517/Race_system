import { pageHeader } from '../ui/shell.js';

const BACKUP_FORMAT = 'spin-league-backup';
const BACKUP_VERSION = 1;

export function dataManagementView(tournaments) {
  const completedMatches = tournaments.reduce((total, tournament) => total + (tournament.rounds || []).reduce((roundTotal, round) => roundTotal + (round.matches || []).filter((match) => match.status === '已完成').length, 0), 0);
  const players = tournaments.reduce((total, tournament) => total + (tournament.players?.length || 0), 0);
  const disabled = tournaments.length ? '' : 'disabled';

  return `<section class="section-wrap page-section">
    ${pageHeader('DATA MANAGEMENT', '資料管理', '備份完整賽事、匯出 Excel 報表，或從既有備份還原雲端資料。', '<button class="button button-secondary" data-route="control">← 返回後台</button>')}
    <div class="data-summary">
      <div><b>${tournaments.length}</b><span>場賽事</span></div>
      <div><b>${players}</b><span>參賽人次</span></div>
      <div><b>${completedMatches}</b><span>已完成比賽</span></div>
      <div><b>雲端</b><span>目前儲存位置</span></div>
    </div>
    <div class="data-grid">
      <article class="data-card"><span class="data-card-label">FULL BACKUP</span><h2>完整 JSON 備份</h2><p>包含所有賽事、名單、種子、賽程、比分、統計與冠軍資料，可供日後完整還原。</p><button class="button button-primary" data-action="export-json" ${disabled}>下載完整備份</button></article>
      <article class="data-card"><span class="data-card-label">EXCEL REPORT</span><h2>CSV 賽果報表</h2><p>將每場對戰整理成表格，可直接使用 Microsoft Excel、Google 試算表或 Numbers 開啟。</p><button class="button button-secondary" data-action="export-csv" ${disabled}>下載 CSV 報表</button></article>
      <article class="data-card data-card-warning"><span class="data-card-label">RESTORE</span><h2>從備份還原</h2><p>選擇先前匯出的 Spin League JSON。驗證成功並再次確認後，將取代目前的全部雲端賽事。</p><input type="file" accept="application/json,.json" data-backup-file hidden><button class="button button-secondary" data-action="import-json">選擇備份檔案</button></article>
    </div>
    <div class="data-notice"><b>安全提醒</b><span>建議每次大型賽事結束後下載一份完整 JSON 備份。匯入前也先匯出現況，方便需要時復原。</span></div>
  </section>`;
}

export function bindDataManagement(root, tournaments, { onImport }) {
  root.querySelector('[data-action="export-json"]')?.addEventListener('click', () => {
    download(`spin-league-backup-${dateStamp()}.json`, JSON.stringify(createBackup(tournaments), null, 2), 'application/json');
  });
  root.querySelector('[data-action="export-csv"]')?.addEventListener('click', () => {
    download(`spin-league-results-${dateStamp()}.csv`, `\ufeff${createCsv(tournaments)}`, 'text/csv;charset=utf-8');
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

function csvCell(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
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

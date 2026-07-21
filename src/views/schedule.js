import { icons } from '../ui/icons.js';
import { pageHeader } from '../ui/shell.js';
import { buildRounds, getTournamentStandings, requiredSeedCount } from '../domain/tournament.js';

export function scheduleView(tournaments, selectedId) {
  const selected = tournaments.find((item) => item.id === selectedId);
  if (selected) return bracketView(selected);
  const cards = tournaments.map((item) => `<article class="event-card"><button class="event-open" data-tournament-id="${item.id}"><span class="event-status"><i></i>${item.status || '準備中'}</span><div class="event-icon">${icons.trophy}</div><h2>${item.name}</h2><p>${item.players.length} 位選手 · ${item.created}</p><span class="event-action">查看完整賽程 ${icons.arrow}</span></button><button class="event-delete" data-delete-tournament="${item.id}" data-tournament-name="${escapeAttribute(item.name)}" aria-label="刪除 ${escapeAttribute(item.name)}">刪除賽事</button></article>`).join('');
  return `<section class="section-wrap page-section">${pageHeader('TOURNAMENTS', '賽程表', '查看已建立的賽事與完整淘汰賽對戰。', '<button class="button button-primary" data-route="manage">＋ 建立新賽事</button>')} ${cards ? `<div class="event-grid">${cards}</div>` : `<div class="empty-state"><div>${icons.bracket}</div><h2>還沒有任何賽事</h2><p>建立第一場賽事，對戰樹狀圖會顯示在這裡。</p><button class="button button-primary" data-route="manage">建立新賽事</button></div>`}</section>`;
}

function bracketView(tournament) {
  const rounds = buildRounds(tournament);
  const isDraft = tournament.status === '準備中';
  const seedCount = requiredSeedCount(tournament);
  const seedIndexes = tournament.seedPlayerIndexes || [];
  const seedsReady = seedCount === 0 || seedIndexes.length === seedCount;
  const seedNames = seedIndexes.map((index) => tournament.players[index]).filter(Boolean);
  const allSeedNames = new Set(rounds.map((round) => round.seedPlayer).filter(Boolean));
  const champion = tournament.champion ? `<div class="champion-banner">${icons.trophy}<span>本屆冠軍</span><b>${tournament.champion}</b></div>` : '';
  const seedButton = isDraft && seedCount > 0 ? `<button class="button button-seed" data-action="draw-seeds">${seedsReady ? '重新抽選種子' : '隨機抽選種子'}（${seedCount} 位）</button>` : '';
  const headerActions = `<div class="header-actions">${isDraft ? `<button class="button button-secondary" data-action="edit-tournament">編輯賽事</button>${seedButton}<button class="button button-primary" data-action="start-tournament" ${seedsReady ? '' : 'disabled'}>賽事開始</button>` : ''}<button class="button button-secondary" data-action="back-events">← 返回列表</button></div>`;
  const guide = isDraft
    ? `<span><i class="draft-dot"></i>${seedsReady ? '目前為預覽賽程，開始前可重新抽選種子' : `需要先抽選 ${seedCount} 位種子選手`}</span><span>按下「賽事開始」後種子與名單都會鎖定</span>`
    : '<span><i class="ready-dot"></i>可點擊「可開始」的節點進入記分板</span><span>輪空選手已自動晉級</span>';
  const seedPanel = seedCount > 0 ? `<div class="seed-panel ${seedsReady ? 'is-drawn' : ''}"><div class="seed-panel-copy"><span>INITIAL SEED</span><b>${seedsReady ? '已抽出首輪種子選手' : '本賽事首輪需要 1 位種子選手'}</b><p>${seedsReady ? (isDraft ? '種子選手首輪輪空；賽事開始前仍可重新抽選。' : '首輪種子與參賽名單已隨賽事開始鎖定。') : '請使用上方按鈕隨機抽選，完成後才會產生正式預覽賽程。'}</p></div><div class="seed-list">${seedsReady ? seedNames.map((name) => `<span>${escapeText(name)}<i>SEED</i></span>`).join('') : '<em>等待抽選</em>'}</div></div>` : '';
  const bracket = rounds.length ? `<div class="bracket-shell"><div class="bracket-flow">${rounds.map((round, roundIndex) => `<section class="round-column"><div class="round-heading"><span>ROUND ${String(roundIndex + 1).padStart(2, '0')}</span><b>${round.name}</b></div><div class="round-matches">${round.matches.map((match, matchIndex) => matchCard(match, roundIndex, matchIndex, !isDraft, allSeedNames, round.seedReason)).join('')}</div></section>`).join('')}</div></div>` : `<div class="bracket-pending">${icons.bracket}<h2>等待種子抽選</h2><p>抽選完成後，完整對戰分支圖會顯示在這裡。</p></div>`;
  const leaderboard = tournament.champion ? leaderboardView(getTournamentStandings(tournament)) : '';
  return `<section class="section-wrap page-section">${pageHeader(isDraft ? 'BRACKET PREVIEW' : 'LIVE BRACKET', tournament.name, `${tournament.players.length} 位參賽者 · 單淘汰賽 · ${isDraft ? '準備中' : tournament.status} · 建立於 ${tournament.created}`, headerActions)}${champion}${seedPanel}<div class="bracket-guide">${guide}</div>${bracket}${leaderboard}</section>`;
}

function leaderboardView(rows) {
  return `<section class="leaderboard"><div class="leaderboard-heading"><div><p class="kicker">FINAL STANDINGS</p><h2>賽事排行榜</h2></div><span>依冠軍、勝場、總分與得失分差排序</span></div><div class="leaderboard-table"><div class="leaderboard-row leaderboard-header"><span>名次</span><span>選手</span><span>勝</span><span>敗</span><span>總分</span></div>${rows.map((row) => `<div class="leaderboard-row ${row.isChampion ? 'is-champion' : ''}"><span class="rank">${row.rank === 1 ? icons.trophy : String(row.rank).padStart(2, '0')}</span><strong>${escapeText(row.player)}${row.isChampion ? '<small>CHAMPION</small>' : ''}</strong><span>${row.wins}</span><span>${row.losses}</span><b>${row.totalPoints}</b></div>`).join('')}</div></section>`;
}

function matchCard(match, roundIndex, matchIndex, scoringEnabled, seedNames, seedReason) {
  const interactive = scoringEnabled && match.status === '可開始';
  const scoreA = match.scoreA ?? '—';
  const scoreB = match.scoreB ?? '—';
  const displayStatus = scoringEnabled && match.status === '輪空晉級' && seedReason === 'performance'
    ? '表現種子晉級'
    : scoringEnabled && match.status === '輪空晉級' && seedReason === 'random'
      ? '隨機種子晉級'
      : !scoringEnabled && match.status === '輪空晉級'
    ? '預定輪空'
    : !scoringEnabled && match.status === '可開始' ? '等待賽事開始' : match.status;
  return `<button class="match-card ${interactive ? 'is-ready' : ''} ${match.status === '已完成' ? 'is-complete' : ''}" data-round-index="${roundIndex}" data-match-index="${matchIndex}" ${interactive ? '' : 'disabled'}><div class="match-meta"><span>MATCH ${String(matchIndex + 1).padStart(2, '0')}</span><i>${displayStatus}</i></div><div class="competitor ${match.playerA === '輪空' || match.playerA === '待定' ? 'muted' : ''} ${scoringEnabled && match.winner === match.playerA ? 'winner' : ''}"><span>${escapeText(match.playerA)}${seedNames.has(match.playerA) ? '<small>SEED</small>' : ''}</span><b>${scoreA}</b></div><div class="competitor ${match.playerB === '輪空' || match.playerB === '待定' ? 'muted' : ''} ${scoringEnabled && match.winner === match.playerB ? 'winner' : ''}"><span>${escapeText(match.playerB)}${seedNames.has(match.playerB) ? '<small>SEED</small>' : ''}</span><b>${scoreB}</b></div></button>`;
}

function escapeAttribute(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function escapeText(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

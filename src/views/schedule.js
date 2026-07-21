import { icons } from '../ui/icons.js';
import { pageHeader } from '../ui/shell.js';
import { buildRounds } from '../domain/tournament.js';

export function scheduleView(tournaments, selectedId) {
  const selected = tournaments.find((item) => item.id === selectedId);
  if (selected) return bracketView(selected);
  const cards = tournaments.map((item) => `<article class="event-card"><button class="event-open" data-tournament-id="${item.id}"><span class="event-status"><i></i>${item.status || '準備中'}</span><div class="event-icon">${icons.trophy}</div><h2>${item.name}</h2><p>${item.players.length} 位選手 · ${item.created}</p><span class="event-action">查看完整賽程 ${icons.arrow}</span></button><button class="event-delete" data-delete-tournament="${item.id}" data-tournament-name="${escapeAttribute(item.name)}" aria-label="刪除 ${escapeAttribute(item.name)}">刪除賽事</button></article>`).join('');
  return `<section class="section-wrap page-section">${pageHeader('TOURNAMENTS', '賽程表', '查看已建立的賽事與完整淘汰賽對戰。', '<button class="button button-primary" data-route="manage">＋ 建立新賽事</button>')} ${cards ? `<div class="event-grid">${cards}</div>` : `<div class="empty-state"><div>${icons.bracket}</div><h2>還沒有任何賽事</h2><p>建立第一場賽事，對戰樹狀圖會顯示在這裡。</p><button class="button button-primary" data-route="manage">建立新賽事</button></div>`}</section>`;
}

function bracketView(tournament) {
  const rounds = buildRounds(tournament);
  const isDraft = tournament.status === '準備中';
  const champion = tournament.champion ? `<div class="champion-banner">${icons.trophy}<span>本屆冠軍</span><b>${tournament.champion}</b></div>` : '';
  const headerActions = `<div class="header-actions">${isDraft ? '<button class="button button-secondary" data-action="edit-tournament">編輯賽事</button><button class="button button-primary" data-action="start-tournament">賽事開始</button>' : ''}<button class="button button-secondary" data-action="back-events">← 返回列表</button></div>`;
  const guide = isDraft
    ? '<span><i class="draft-dot"></i>目前為預覽賽程，開始前仍可修改參賽名單</span><span>按下「賽事開始」後才會啟用記分</span>'
    : '<span><i class="ready-dot"></i>可點擊「可開始」的節點進入記分板</span><span>輪空選手已自動晉級</span>';
  return `<section class="section-wrap page-section">${pageHeader(isDraft ? 'BRACKET PREVIEW' : 'LIVE BRACKET', tournament.name, `${tournament.players.length} 位參賽者 · 單淘汰賽 · ${isDraft ? '準備中' : tournament.status} · 建立於 ${tournament.created}`, headerActions)}${champion}<div class="bracket-guide">${guide}</div><div class="bracket-shell"><div class="bracket-flow">${rounds.map((round, roundIndex) => `<section class="round-column"><div class="round-heading"><span>ROUND ${String(roundIndex + 1).padStart(2, '0')}</span><b>${round.name}</b></div><div class="round-matches">${round.matches.map((match, matchIndex) => matchCard(match, roundIndex, matchIndex, !isDraft)).join('')}</div></section>`).join('')}</div></div></section>`;
}

function matchCard(match, roundIndex, matchIndex, scoringEnabled) {
  const interactive = scoringEnabled && match.status === '可開始';
  const scoreA = match.scoreA ?? '—';
  const scoreB = match.scoreB ?? '—';
  const displayStatus = !scoringEnabled && match.status === '輪空晉級'
    ? '預定輪空'
    : !scoringEnabled && match.status === '可開始' ? '等待賽事開始' : match.status;
  return `<button class="match-card ${interactive ? 'is-ready' : ''} ${match.status === '已完成' ? 'is-complete' : ''}" data-round-index="${roundIndex}" data-match-index="${matchIndex}" ${interactive ? '' : 'disabled'}><div class="match-meta"><span>MATCH ${String(matchIndex + 1).padStart(2, '0')}</span><i>${displayStatus}</i></div><div class="competitor ${match.playerA === '輪空' || match.playerA === '待定' ? 'muted' : ''} ${scoringEnabled && match.winner === match.playerA ? 'winner' : ''}"><span>${match.playerA}</span><b>${scoreA}</b></div><div class="competitor ${match.playerB === '輪空' || match.playerB === '待定' ? 'muted' : ''} ${scoringEnabled && match.winner === match.playerB ? 'winner' : ''}"><span>${match.playerB}</span><b>${scoreB}</b></div></button>`;
}

function escapeAttribute(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

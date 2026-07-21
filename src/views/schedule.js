import { icons } from '../ui/icons.js';
import { pageHeader } from '../ui/shell.js';
import { buildRounds } from '../domain/tournament.js';

export function scheduleView(tournaments, selectedId) {
  const selected = tournaments.find((item) => item.id === selectedId);
  if (selected) return bracketView(selected);
  const cards = tournaments.map((item) => `<button class="event-card" data-tournament-id="${item.id}"><span class="event-status"><i></i>${item.status || '準備中'}</span><div class="event-icon">${icons.trophy}</div><h2>${item.name}</h2><p>${item.players.length} 位選手 · ${item.created}</p><span class="event-action">查看完整賽程 ${icons.arrow}</span></button>`).join('');
  return `<section class="section-wrap page-section">${pageHeader('TOURNAMENTS', '賽程表', '查看已建立的賽事與完整淘汰賽對戰。', '<button class="button button-primary" data-route="manage">＋ 建立新賽事</button>')} ${cards ? `<div class="event-grid">${cards}</div>` : `<div class="empty-state"><div>${icons.bracket}</div><h2>還沒有任何賽事</h2><p>建立第一場賽事，對戰樹狀圖會顯示在這裡。</p><button class="button button-primary" data-route="manage">建立新賽事</button></div>`}</section>`;
}

function bracketView(tournament) {
  const rounds = buildRounds(tournament);
  return `<section class="section-wrap page-section">${pageHeader('LIVE BRACKET', tournament.name, `${tournament.players.length} 位參賽者 · 單淘汰賽 · 建立於 ${tournament.created}`, '<button class="button button-secondary" data-action="back-events">← 返回賽事列表</button>')}<div class="bracket-shell"><div class="bracket-flow">${rounds.map((round, roundIndex) => `<section class="round-column"><div class="round-heading"><span>ROUND ${String(roundIndex + 1).padStart(2, '0')}</span><b>${round.name}</b></div><div class="round-matches">${round.matches.map((match, matchIndex) => matchCard(match, matchIndex)).join('')}</div></section>`).join('')}</div></div></section>`;
}

function matchCard(match, index) {
  return `<article class="match-card"><div class="match-meta"><span>MATCH ${String(index + 1).padStart(2, '0')}</span><i>${match.status}</i></div><div class="competitor ${match.playerA === '輪空' || match.playerA === '待定' ? 'muted' : ''}"><span>${match.playerA}</span><b>—</b></div><div class="competitor ${match.playerB === '輪空' || match.playerB === '待定' ? 'muted' : ''}"><span>${match.playerB}</span><b>—</b></div></article>`;
}

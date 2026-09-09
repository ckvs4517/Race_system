/** Round Robin 並列冠軍決策面板。 */
import { getTournamentStandings } from '../../domain/tournament.js';
import { escapeAttribute, escapeText } from './html-escape.js';

export function roundRobinTieBreakPanel(tournament, canManage) {
  if (tournament.roundRobinStage !== 'tied') return '';
  const rows = getTournamentStandings(tournament);
  const tiedGroups = new Map();
  rows.forEach((row) => { if (!tiedGroups.has(row.rank)) tiedGroups.set(row.rank, []); tiedGroups.get(row.rank).push(row); });
  const choices = [...tiedGroups.values()].filter((group) => group.length > 1 && group[0].rank === 1)
    .map((group) => `<div class="swiss-player-choices"><p class="swiss-choice-note">並列第一名</p>${group.map((row) => `<label class="swiss-player-choice"><input type="checkbox" name="candidate" value="${escapeAttribute(row.player)}"><span><b>${escapeText(row.player)}</b><small>${row.wins} 勝 ${row.losses} 敗 · 總得分 ${row.totalPoints}</small></span></label>`).join('')}</div>`).join('');
  if (!choices) return '';
  return `<section class="swiss-decision-panel"><p class="kicker">TIE BREAK</p><h2>並列冠軍確認</h2><p>目前第一名的勝場與總得分完全相同，因此先以並列冠軍顯示。主辦方可選擇這組選手建立循環加賽，決定唯一冠軍。</p>${canManage ? `<form data-round-robin-tiebreak-form>${choices}<button class="button button-primary" type="submit">建立冠軍加賽</button></form>` : '<p>主辦方可視需要建立冠軍加賽。</p>'}</section>`;
}

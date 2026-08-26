/** 即時排行榜、選手階段成績與已完成對戰紀錄。 */
import { getSwissPhaseStandings, getTournamentStandings } from '../../domain/tournament.js';
import { icons } from '../../ui/icons.js';
import { escapeAttribute, escapeText } from './html-escape.js';
import { roundPhaseLabel } from './rounds.js';

export function swissLiveLeaderboardRows(tournament) {
  const stage = tournament.swissStage || 'preliminary';
  if (stage === 'preliminary') return getSwissPhaseStandings(tournament, 'preliminary');
  if (stage === 'qualifier') return getSwissPhaseStandings(tournament, 'qualifier');
  if (stage === 'final') return getTournamentStandings(tournament).filter((row) => (tournament.finalists || []).includes(row.player));
  return getTournamentStandings(tournament);
}

export function leaderboardView(tournament, rows, isSwiss) {
  const metric = '總得分';
  const description = leaderboardDescription(tournament, isSwiss);
  const completed = tournament.status === '已完成';
  return `<section class="leaderboard"><div class="leaderboard-heading"><div><p class="kicker">${isSwiss ? 'LIVE STANDINGS' : 'LIVE STANDINGS'}</p><h2>賽事排行榜</h2></div><span>${description}；點選選手可查看已完成對戰${completed ? '與下載戰績圖' : ''}</span></div><div class="leaderboard-table"><div class="leaderboard-row leaderboard-header"><span>名次</span><span>選手</span><span>勝</span><span>敗</span><span>${metric}</span></div>${rows.map((row) => leaderboardPlayerRow(tournament, row, completed, rows)).join('')}</div></section>`;
}

function leaderboardDescription(tournament, isSwiss) {
  if (!isSwiss) return '依冠軍、勝場、總分與得失分差排序';
  if (tournament.swissFinalMode === 'single_elimination' && ['final', 'completed'].includes(tournament.swissStage)) {
    return '四強名次依淘汰賽結果，其餘選手依瑞士輪成績排序';
  }
  if (tournament.swissFinalMode === 'round_robin' && ['final', 'completed'].includes(tournament.swissStage)) {
    return '四強循環依勝場、敗場、總得分排序；兩人完全同分時比較直接對戰，三人以上同分會自動加賽';
  }
  return '依勝場、敗場、總得分依序排名';
}

function leaderboardPlayerRowLegacy(tournament, row, canDownloadShareCard) {
  const status = row.isChampion ? '<small>CHAMPION</small>' : row.participantStatus === 'no_show' ? '<small>未出席</small>' : row.participantStatus === 'withdrawn' ? '<small>已退賽</small>' : '';
  const matches = playerCompletedMatches(tournament, row.player);
  const history = matches.length
    ? matches.map((entry) => `<li><span>${escapeText(roundPhaseLabel(entry.round, entry.roundIndex))}</span><b>${escapeText(entry.opponent)}</b><i>${escapeText(entry.result)}</i></li>`).join('')
    : '<li class="player-history-empty">尚無已完成對戰紀錄。</li>';
  return `<details class="leaderboard-player ${row.isChampion ? 'is-champion' : ''} ${row.participantStatus !== 'active' ? 'is-inactive' : ''}">
    <summary class="leaderboard-row"><span class="rank">${row.rank === 1 ? icons.trophy : String(row.rank).padStart(2, '0')}</span><strong>${escapeText(row.player)}${status}<em>對戰紀錄</em></strong><span>${row.wins}</span><span>${row.losses}</span><b>${row.totalPoints}</b></summary>
    <div class="player-history"><h3>${escapeText(row.player)}的已完成對戰</h3><ul>${history}</ul>${canDownloadShareCard ? `<button class="button button-primary player-share-card" data-download-share-card="${escapeAttribute(row.player)}">下載戰績圖</button>` : ''}</div>
  </details>`;
}

function leaderboardPlayerRow(tournament, row, canDownloadShareCard, rows = []) {
  const matches = playerCompletedMatches(tournament, row.player);
  const history = matches.length ? matches.map((entry) => `<li><span>${escapeText(roundPhaseLabel(entry.round, entry.roundIndex))}</span><b>${escapeText(entry.opponent)}</b><i>${escapeText(entry.result)}</i></li>`).join('') : '<li class="player-history-empty">尚無已完成對戰</li>';
  const stages = stageSummaryView(tournament, row.player);
  const status = row.isChampion ? '<small>CHAMPION</small>' : '';
  const rankingReason = swissDirectMatchReason(tournament, row, rows);
  return `<details class="leaderboard-player ${row.isChampion ? 'is-champion' : ''}"><summary class="leaderboard-row"><span class="rank">${row.rank === 1 ? icons.trophy : String(row.rank).padStart(2, '0')}</span><strong>${escapeText(row.player)}${status}${rankingReason}</strong><span>${row.wins}</span><span>${row.losses}</span><b>${row.totalPoints}</b></summary><div class="player-history"><h3>${escapeText(row.player)}的階段成績</h3>${stages}<ul>${history}</ul>${canDownloadShareCard ? `<button class="button button-primary player-share-card" data-download-share-card="${escapeAttribute(row.player)}">下載戰績圖</button>` : ''}</div></details>`;
}

function swissDirectMatchReason(tournament, row, rows) {
  if (tournament.format !== 'swiss' || tournament.swissFinalMode !== 'round_robin') return '';
  if (!(tournament.finalists || []).includes(row.player)) return '';
  const sameRecord = rows.filter((candidate) => candidate.player !== row.player
    && (tournament.finalists || []).includes(candidate.player)
    && candidate.wins === row.wins
    && candidate.losses === row.losses
    && candidate.totalPoints === row.totalPoints);
  if (sameRecord.length !== 1 || sameRecord[0].rank === row.rank) return '';
  return row.rank < sameRecord[0].rank ? '<small>直接對戰優勢</small>' : '<small>直接對戰劣勢</small>';
}

function stageSummaryView(tournament, player) {
  const groups = new Map();
  (tournament.rounds || []).forEach((round) => {
    const phase = round.phase || 'preliminary';
    const label = phase === 'preliminary' ? '瑞士輪' : phase === 'qualifier' ? '同分加賽' : '四強／決賽';
    if (!groups.has(label)) groups.set(label, { wins: 0, losses: 0, points: 0 });
    round.matches.filter((match) => match.status === '已完成' && [match.playerA, match.playerB].includes(player)).forEach((match) => {
      const group = groups.get(label);
      const isA = match.playerA === player;
      group.points += Number(isA ? match.scoreA : match.scoreB) || 0;
      if (match.winner === player) group.wins += 1; else group.losses += 1;
    });
  });
  return `<div class="leaderboard-stage-summary">${[...groups].map(([label, value]) => `<span><b>${label}</b><i>${value.wins} 勝 ${value.losses} 敗 · ${value.points} 分</i></span>`).join('')}</div>`;
}

function playerCompletedMatches(tournament, player) {
  return (tournament.rounds || []).flatMap((round, roundIndex) => round.matches
    .filter((match) => (match.playerA === player || match.playerB === player) && ['已完成', '輪空晉級'].includes(match.status))
    .map((match) => {
      const isA = match.playerA === player;
      const opponent = isA ? match.playerB : match.playerA;
      const isBye = opponent === '輪空';
      const score = isBye ? '輪空晉級' : `${isA ? match.scoreA : match.scoreB}：${isA ? match.scoreB : match.scoreA}`;
      const result = isBye ? score : `${match.winner === player ? '勝' : '敗'} · ${score}`;
      return { round, roundIndex, opponent: isBye ? '輪空' : opponent, result };
    }));
}

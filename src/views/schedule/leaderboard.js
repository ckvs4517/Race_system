/** 即時排行榜、選手階段成績與已完成對戰紀錄。 */
import { getSwissPhaseStandings, getTournamentStandings } from '../../domain/tournament.js';
import { SWISS_RANKING_RULE_BUCHHOLZ, normalizeSwissRankingRule } from '../../domain/ranking/swiss-ranking.js';
import { icons } from '../../ui/icons.js';
import { escapeAttribute, escapeText } from './html-escape.js';
import { roundPhaseLabel } from './rounds.js';

export function swissLiveLeaderboardRows(tournament) {
  const stage = tournament.swissStage || 'preliminary';
  if (stage === 'preliminary') return getSwissPhaseStandings(tournament, 'preliminary');
  if (stage === 'qualifier') return getSwissPhaseStandings(tournament, 'qualifier');
  if (['final', 'completed'].includes(stage) && (tournament.finalists || []).length) {
    const finalistSet = new Set(tournament.finalists || []);
    return getTournamentStandings(tournament).filter((row) => finalistSet.has(row.player));
  }
  return getTournamentStandings(tournament);
}

export function leaderboardView(tournament, rows, isSwiss) {
  const showOpponentWins = shouldShowSwissOpponentWins(tournament);
  const rowClass = showOpponentWins ? ' has-buchholz' : '';
  const opponentHeader = showOpponentWins ? '<span>對手勝場</span>' : '';
  const description = leaderboardDescription(tournament, isSwiss, showOpponentWins);
  const completed = tournament.status === '已完成';
  const archivedRows = isSwiss ? swissArchivedLeaderboardRows(tournament) : [];
  const archivedShowOpponentWins = isSwiss
    && normalizeSwissRankingRule(tournament.swissRankingRule) === SWISS_RANKING_RULE_BUCHHOLZ;
  const archivedRowClass = archivedShowOpponentWins ? ' has-buchholz' : '';
  const archivedOpponentHeader = archivedShowOpponentWins ? '<span>對手勝場</span>' : '';
  const downloadHint = completed || archivedRows.length ? '與下載戰績圖' : '';
  const activeTable = `<div class="leaderboard-table"><div class="leaderboard-row leaderboard-header${rowClass}"><span>名次</span><span>選手</span><span>勝</span><span>敗</span>${opponentHeader}<span>總得分</span></div>${rows.map((row) => leaderboardPlayerRow(tournament, row, completed, rows, showOpponentWins)).join('')}</div>`;
  const archive = archivedRows.length
    ? `<details class="leaderboard-archive"><summary><span>第一階段止步選手（${archivedRows.length}）</span><small>查看排名、完整戰績與戰績圖</small></summary><div class="leaderboard-table"><div class="leaderboard-row leaderboard-header${archivedRowClass}"><span>名次</span><span>選手</span><span>勝</span><span>敗</span>${archivedOpponentHeader}<span>總得分</span></div>${archivedRows.map((row) => leaderboardPlayerRow(tournament, row, true, archivedRows, archivedShowOpponentWins)).join('')}</div></details>`
    : '';
  return `<section class="leaderboard"><div class="leaderboard-heading"><div><p class="kicker">LIVE STANDINGS</p><h2>賽事排行榜</h2></div><span>${description}；點選選手可查看已完成對戰${downloadHint}</span></div>${activeTable}${archive}</section>`;
}

function leaderboardDescription(tournament, isSwiss, showOpponentWins = false) {
  if (!isSwiss) return '依冠軍、勝場、總分與得失分差排序';
  if (showOpponentWins) return '依勝場、對手勝場總和、總得分、直接對戰依序排名；輪空以該階段總輪數一半計入對手勝場';
  if (tournament.swissFinalMode === 'single_elimination' && ['final', 'completed'].includes(tournament.swissStage)) {
    return '四強名次依淘汰賽結果，其餘選手依瑞士輪成績排序';
  }
  if (tournament.swissFinalMode === 'round_robin' && ['final', 'completed'].includes(tournament.swissStage)) {
    const advanceCount = readSwissStage2Config(tournament)?.advanceCount || tournament.finalists?.length || 4;
    return `Top ${advanceCount} 循環依勝場、敗場、總得分排序；兩人完全同分時比較直接對戰，三人以上同分會自動加賽`;
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

function leaderboardPlayerRow(tournament, row, canDownloadShareCard, rows = [], showOpponentWins = false) {
  const matches = playerCompletedMatches(tournament, row.player);
  const history = matches.length ? matches.map((entry) => `<li><span>${escapeText(roundPhaseLabel(entry.round, entry.roundIndex))}</span><b>${escapeText(entry.opponent)}</b><i>${escapeText(entry.result)}</i></li>`).join('') : '<li class="player-history-empty">尚無已完成對戰</li>';
  const stages = stageSummaryView(tournament, row.player);
  const status = row.isChampion ? '<small>CHAMPION</small>' : row.participantStatus === 'no_show' ? '<small>未出席</small>' : row.participantStatus === 'withdrawn' ? '<small>已退賽</small>' : '';
  const rankingReason = row.rankResolution?.criterion === 'head_to_head'
    ? '<small>直接對戰判定</small>'
    : swissDirectMatchReason(tournament, row, rows);
  const opponentWins = showOpponentWins ? `<span>${formatOpponentWins(row.opponentWins)}</span>` : '';
  return `<details class="leaderboard-player ${row.isChampion ? 'is-champion' : ''} ${row.participantStatus !== 'active' ? 'is-inactive' : ''}"><summary class="leaderboard-row${showOpponentWins ? ' has-buchholz' : ''}"><span class="rank">${row.rank === 1 ? icons.trophy : String(row.rank).padStart(2, '0')}</span><strong>${escapeText(row.player)}${status}${rankingReason}</strong><span>${row.wins}</span><span>${row.losses}</span>${opponentWins}<b>${row.totalPoints}</b></summary><div class="player-history"><h3>${escapeText(row.player)}的階段成績</h3>${stages}<ul>${history}</ul>${canDownloadShareCard ? `<button class="button button-primary player-share-card" data-download-share-card="${escapeAttribute(row.player)}">下載戰績圖</button>` : ''}</div></details>`;
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
    const key = phase === 'preliminary'
      ? 'preliminary'
      : phase === 'qualifier'
        ? 'qualifier'
        : phase === 'placement'
          ? 'placement'
          : round.seriesId === 'stage2-swiss'
            ? 'stage2'
            : 'final';
    const label = {
      preliminary: '瑞士輪',
      qualifier: '同分加賽',
      placement: '冠亞名次加賽',
      stage2: '第二階段瑞士輪',
      final: tournament.swissStage2Config ? '第二階段' : '四強／決賽',
    }[key];
    if (!groups.has(key)) groups.set(key, { label, wins: 0, losses: 0, points: 0, opponentWins: null });
    round.matches.filter((match) => match.status === '已完成' && [match.playerA, match.playerB].includes(player)).forEach((match) => {
      const group = groups.get(key);
      const isA = match.playerA === player;
      group.points += Number(isA ? match.scoreA : match.scoreB) || 0;
      if (match.winner === player) group.wins += 1; else group.losses += 1;
    });
  });

  if (normalizeSwissRankingRule(tournament.swissRankingRule) === SWISS_RANKING_RULE_BUCHHOLZ) {
    const preliminary = getSwissPhaseStandings(tournament, 'preliminary').find((row) => row.player === player);
    if (groups.has('preliminary') && preliminary) groups.get('preliminary').opponentWins = preliminary.opponentWins;
    if (tournament.swissFinalMode === 'swiss' && groups.has('stage2')) {
      const stage2 = getSwissPhaseStandings(tournament, 'final').find((row) => row.player === player);
      if (stage2) groups.get('stage2').opponentWins = stage2.opponentWins;
    }
  }

  return `<div class="leaderboard-stage-summary">${[...groups.values()].map((value) => `<span><b>${value.label}</b><i>${value.wins} 勝 ${value.losses} 敗 · ${value.points} 分${value.opponentWins == null ? '' : ` · 對手勝場 ${formatOpponentWins(value.opponentWins)}`}</i></span>`).join('')}</div>`;
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

function swissArchivedLeaderboardRows(tournament) {
  const stage = tournament.swissStage || 'preliminary';
  if (!['final', 'completed'].includes(stage) || !(tournament.finalists || []).length) return [];
  const finalistSet = new Set(tournament.finalists || []);
  return getTournamentStandings(tournament).filter((row) => !finalistSet.has(row.player));
}

function shouldShowSwissOpponentWins(tournament) {
  if (tournament.format !== 'swiss'
    || normalizeSwissRankingRule(tournament.swissRankingRule) !== SWISS_RANKING_RULE_BUCHHOLZ) return false;
  const stage = tournament.swissStage || 'preliminary';
  if (['preliminary', 'qualification'].includes(stage)) return true;
  if (stage === 'qualifier') return false;
  if (['final', 'completed'].includes(stage) && tournament.swissFinalMode === 'swiss') return true;
  return stage === 'completed' && tournament.swissFinalMode === 'standings';
}

function formatOpponentWins(value) {
  const number = Number(value) || 0;
  return Number.isInteger(number) ? String(number) : number.toFixed(1);
}

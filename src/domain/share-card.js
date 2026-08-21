import { getTournamentStandings, normalizeTournament } from './tournament.js';

/**
 * 整理一名選手跨所有正式賽程階段的戰績，供分享圖模板使用。
 *
 * 必須直接從已完成對戰累積，而不能使用 playerStats：瑞士制的
 * playerStats 刻意只保存預賽統計；分享戰績則要從第一輪一路包含
 * 瑞士輪、資格加賽、四強循環、淘汰賽等所有正式對戰。
 *
 * @param {object} sourceTournament 原始或已正規化的賽事資料。
 * @param {string} playerName 要產生戰績圖的選手名稱。
 * @returns {object} 與畫面無關的分享圖資料模型。
 */
export function buildShareCardData(sourceTournament, playerName) {
  const tournament = normalizeTournament(sourceTournament);
  const ranking = getTournamentStandings(tournament);
  const rank = ranking.find((row) => row.player === playerName)?.rank || ranking.length + 1;
  const matches = completedPlayerMatches(tournament, playerName);
  const wins = matches.filter((match) => match.result === 'win').length;
  const losses = matches.length - wins;
  const totalScore = matches.reduce((total, match) => total + match.scoreFor, 0);
  const stageStats = completedStageStats(tournament, playerName);

  return {
    tournamentName: tournament.name || 'Spin League 賽事',
    eventDate: tournament.eventInfo?.date || '',
    venueName: tournament.eventInfo?.venueName || '',
    playerName,
    rank,
    wins,
    losses,
    totalScore,
    winRate: matches.length ? Math.round((wins / matches.length) * 100) : 0,
    stageStats,
    matches,
  };
}

function completedStageStats(tournament, playerName) {
  const groups = new Map();
  (tournament.rounds || []).forEach((round) => {
    const phase = round.phase || 'preliminary';
    const label = phase === 'preliminary' ? '瑞士輪' : phase === 'qualifier' ? '同分加賽' : '四強／決賽';
    if (!groups.has(label)) groups.set(label, { wins: 0, losses: 0, points: 0 });
    (round.matches || []).filter((match) => isFormalCompletedMatch(match) && [match.playerA, match.playerB].includes(playerName)).forEach((match) => {
      const value = groups.get(label);
      const isA = match.playerA === playerName;
      value.points += Number(isA ? match.scoreA : match.scoreB) || 0;
      if (match.winner === playerName) value.wins += 1; else value.losses += 1;
    });
  });
  return [...groups].map(([label, value]) => ({ label, ...value }));
}

function completedPlayerMatches(tournament, playerName) {
  return (tournament.rounds || [])
    .flatMap((round, roundIndex) => (round.matches || []).map((match, matchIndex) => ({ round, roundIndex, match, matchIndex })))
    .filter(({ match }) => (match.playerA === playerName || match.playerB === playerName) && isFormalCompletedMatch(match))
    .map(({ round, roundIndex, match, matchIndex }) => {
      const isA = match.playerA === playerName;
      return {
        phase: phaseLabel(round, roundIndex),
        order: [roundIndex, matchIndex],
        opponent: isA ? match.playerB : match.playerA,
        scoreFor: Number(isA ? match.scoreA : match.scoreB),
        scoreAgainst: Number(isA ? match.scoreB : match.scoreA),
        result: match.winner === playerName ? 'win' : 'loss',
      };
    })
    .sort((left, right) => left.order[0] - right.order[0] || left.order[1] - right.order[1]);
}

/** 將所有賽制統一判斷為「有實際比分的正式完成對戰」，排除輪空。 */
function isFormalCompletedMatch(match) {
  return match.scoreA != null
    && match.scoreB != null
    && Boolean(match.winner)
    && match.playerA !== '輪空'
    && match.playerB !== '輪空';
}

function phaseLabel(round, index) {
  if (round.phase === 'qualifier') return '資格積分決定賽';
  if (round.phase === 'final') return '四強循環決賽';
  return round.name || `ROUND ${String(index + 1).padStart(2, '0')}`;
}

/**
 * 集中管理名次對應的 badge 與 performance label，讓模板只負責呈現。
 * @param {object} data 分享圖資料模型。
 * @param {object} assets 素材 manifest。
 * @returns {object} 模板所需的視覺規則與素材路徑。
 */
export function resolveShareCardPresentation(data, assets) {
  const badge = data.rank === 1
    ? assets.badges.champion
    : data.rank <= 4
      ? assets.badges.top4
      : data.rank <= 8
        ? assets.badges.top8
        : assets.badges.rank;
  const isWinning = data.wins >= data.losses;
  const performanceLabel = data.wins === 0
    ? '持續進化'
    : data.losses === 0
      ? '全勝表現'
      : isWinning
        ? '優勢表現'
        : '奮戰到底';

  return {
    badge,
    showRankNumber: data.rank > 8,
    tag: isWinning ? assets.tags.win : assets.tags.loss,
    performanceLabel,
    leagueLogo: assets.logos.league,
    venueLogo: assets.logos.venue,
  };
}

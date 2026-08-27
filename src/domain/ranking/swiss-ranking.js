/**
 * 瑞士輪排名引擎。
 *
 * 只處理「同一個瑞士階段」的衍生排名，不修改賽事資料，也不處理畫面。
 * 舊賽事保留 legacy_v1；新賽事可使用 buchholz_v1。
 */
const BYE = '輪空';

export const SWISS_RANKING_RULE_LEGACY = 'legacy_v1';
export const SWISS_RANKING_RULE_BUCHHOLZ = 'buchholz_v1';
export const DEFAULT_SWISS_RANKING_RULE = SWISS_RANKING_RULE_BUCHHOLZ;

export function normalizeSwissRankingRule(value, fallback = SWISS_RANKING_RULE_LEGACY) {
  if (value === SWISS_RANKING_RULE_BUCHHOLZ) return SWISS_RANKING_RULE_BUCHHOLZ;
  if (value === SWISS_RANKING_RULE_LEGACY) return SWISS_RANKING_RULE_LEGACY;
  return fallback;
}

/**
 * 排出一個瑞士輪階段的名次。
 * buchholz_v1：勝場 → 對手勝場總和 → 自己總得分 → 兩人直接對戰。
 * legacy_v1：維持既有勝場 → 敗場 → 總得分 → 原始順序。
 */
export function rankSwissStandings({
  players = [],
  stats = {},
  rounds = [],
  participantStates = {},
  rule = SWISS_RANKING_RULE_LEGACY,
  totalRounds = 0,
} = {}) {
  const normalizedRule = normalizeSwissRankingRule(rule);
  const order = new Map(players.map((player, index) => [player, index]));
  const rows = players.map((player) => {
    const playerStats = stats[player] || {};
    return {
      player,
      wins: Number(playerStats.wins) || 0,
      losses: Number(playerStats.losses) || 0,
      totalPoints: Number(playerStats.pointsFor) || 0,
      byeCount: Number(playerStats.byeCount) || 0,
      participantStatus: participantStates?.[player]?.status || 'active',
    };
  });

  if (normalizedRule === SWISS_RANKING_RULE_LEGACY) {
    const ranked = [...rows].sort((left, right) => (
      participantRankingGroup(participantStates, left.player) - participantRankingGroup(participantStates, right.player)
      || right.wins - left.wins
      || left.losses - right.losses
      || right.totalPoints - left.totalPoints
      || order.get(left.player) - order.get(right.player)
    ));
    return addGroupedRanks(ranked, (row) => `${participantRankingGroup(participantStates, row.player)}:${row.wins}:${row.losses}:${row.totalPoints}`);
  }

  const opponentWins = calculateOpponentWins({ players, stats, rounds, totalRounds });
  const ranked = rows.map((row) => ({ ...row, opponentWins: opponentWins[row.player] || 0 }))
    .sort((left, right) => (
      participantRankingGroup(participantStates, left.player) - participantRankingGroup(participantStates, right.player)
      || right.wins - left.wins
      || right.opponentWins - left.opponentWins
      || right.totalPoints - left.totalPoints
      || order.get(left.player) - order.get(right.player)
    ));

  return resolveBuchholzRanks(ranked, rounds, participantStates);
}

/**
 * 對手勝場總和：每次實際配對加入該對手在同階段目前／最終勝場。
 * 輪空沒有真實對手，依賽制約定使用「該階段總輪數 ÷ 2」作為虛擬對手勝場。
 */
export function calculateOpponentWins({ players = [], stats = {}, rounds = [], totalRounds = 0 } = {}) {
  const playerSet = new Set(players);
  const values = Object.fromEntries(players.map((player) => [player, 0]));
  const byeValue = Math.max(0, Number(totalRounds) || 0) / 2;

  rounds.forEach((round) => (round.matches || []).forEach((match) => {
    const playerA = match.playerA;
    const playerB = match.playerB;
    if (!playerSet.has(playerA)) return;
    if (playerB === BYE) {
      values[playerA] += byeValue;
      return;
    }
    if (!playerSet.has(playerB)) return;
    values[playerA] += Number(stats?.[playerB]?.wins) || 0;
    values[playerB] += Number(stats?.[playerA]?.wins) || 0;
  }));

  return values;
}

function resolveBuchholzRanks(rows, rounds, participantStates) {
  const result = [];
  let index = 0;

  while (index < rows.length) {
    const key = buchholzStandingKey(rows[index], participantStates);
    const tied = [];
    while (index + tied.length < rows.length
      && buchholzStandingKey(rows[index + tied.length], participantStates) === key) {
      tied.push(rows[index + tied.length]);
    }

    const baseRank = index + 1;
    if (tied.length === 2) {
      const winner = latestHeadToHeadWinner(rounds, tied[0].player, tied[1].player);
      if (winner) {
        tied.sort((left, right) => (left.player === winner ? -1 : right.player === winner ? 1 : 0));
        tied.forEach((row, offset) => result.push({
          ...row,
          rank: baseRank + offset,
          rankResolution: { criterion: 'head_to_head', against: tied[1 - offset].player },
        }));
      } else {
        tied.forEach((row) => result.push({ ...row, rank: baseRank, rankResolution: { criterion: 'unresolved' } }));
      }
    } else if (tied.length > 1) {
      tied.forEach((row) => result.push({ ...row, rank: baseRank, rankResolution: { criterion: 'unresolved' } }));
    } else {
      result.push({ ...tied[0], rank: baseRank });
    }

    index += tied.length;
  }

  return result;
}

function addGroupedRanks(rows, keyFor) {
  let previousKey = null;
  let previousRank = 0;
  return rows.map((row, index) => {
    const key = keyFor(row);
    const rank = index === 0 || key !== previousKey ? index + 1 : previousRank;
    previousKey = key;
    previousRank = rank;
    return { ...row, rank };
  });
}

function buchholzStandingKey(row, participantStates) {
  return `${participantRankingGroup(participantStates, row.player)}:${row.wins}:${row.opponentWins}:${row.totalPoints}`;
}

function latestHeadToHeadWinner(rounds, playerA, playerB) {
  for (let roundIndex = rounds.length - 1; roundIndex >= 0; roundIndex -= 1) {
    const matches = rounds[roundIndex]?.matches || [];
    for (let matchIndex = matches.length - 1; matchIndex >= 0; matchIndex -= 1) {
      const match = matches[matchIndex];
      if (!match.winner || match.playerB === BYE) continue;
      const samePair = (match.playerA === playerA && match.playerB === playerB)
        || (match.playerA === playerB && match.playerB === playerA);
      if (samePair) return match.winner;
    }
  }
  return null;
}

function participantRankingGroup(participantStates, player) {
  const state = participantStates?.[player];
  return state?.status === 'no_show' || state?.checkedIn === false ? 1 : 0;
}

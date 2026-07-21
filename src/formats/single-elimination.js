const BYE = '輪空';
const PENDING = '待定';

export const singleElimination = {
  id: 'single_elimination',
  name: '單淘汰賽',

  initialSeedCount(players) {
    return players.length % 2;
  },

  createOpeningRound(players, seedPlayerIndexes = []) {
    const seedName = seedPlayerIndexes.length ? players[seedPlayerIndexes[0]] : null;
    return createRound(players, seedName, 1, 'random');
  },

  initializeStats(players) {
    return Object.fromEntries(players.map((player) => [player, emptyStats()]));
  },

  activateOpeningRound(round, stats) {
    const activatedStats = structuredClone(stats);
    const byeMatch = round.matches.find((match) => match.status === '輪空晉級');
    if (byeMatch?.winner) activatedStats[byeMatch.winner].byeCount += 1;
    return activatedStats;
  },

  getStandings(tournament) {
    const stats = tournament.playerStats || deriveStats(tournament.players, tournament.rounds);
    return tournament.players.map((player) => {
      const playerStats = { ...emptyStats(), ...(stats[player] || {}) };
      return {
        player,
        wins: playerStats.wins,
        losses: playerStats.losses,
        totalPoints: playerStats.pointsFor,
        pointsAgainst: playerStats.pointsAgainst,
        difference: playerStats.pointsFor - playerStats.pointsAgainst,
        isChampion: tournament.champion === player,
      };
    }).sort((a, b) => Number(b.isChampion) - Number(a.isChampion)
      || b.wins - a.wins
      || b.totalPoints - a.totalPoints
      || b.difference - a.difference
      || a.player.localeCompare(b.player, 'zh-Hant'))
      .map((row, index) => ({ ...row, rank: index + 1 }));
  },

  recordResult(tournament, roundIndex, matchIndex, scoreA, scoreB, random = Math.random) {
    const rounds = structuredClone(tournament.rounds);
    const stats = structuredClone(tournament.playerStats);
    Object.keys(stats).forEach((player) => { stats[player] = { ...emptyStats(), ...stats[player] }; });
    const match = rounds[roundIndex]?.matches[matchIndex];
    if (!match || match.status !== '可開始') throw new Error('這場比賽目前無法記分。');
    if (roundIndex !== rounds.length - 1) throw new Error('只能記錄目前輪次的比賽。');
    if (scoreA === scoreB) throw new Error('比分相同時無法確認勝者。');

    match.scoreA = scoreA;
    match.scoreB = scoreB;
    match.winner = scoreA > scoreB ? match.playerA : match.playerB;
    match.status = '已完成';
    match.completedAt = new Date().toISOString();
    updateStats(stats, match.playerA, scoreA, scoreB);
    updateStats(stats, match.playerB, scoreB, scoreA);
    const loser = match.winner === match.playerA ? match.playerB : match.playerA;
    stats[match.winner].wins += 1;
    stats[loser].losses += 1;

    if (!rounds[roundIndex].matches.every((item) => Boolean(item.winner))) {
      return { rounds, playerStats: stats, champion: null };
    }

    const advancingPlayers = rounds[roundIndex].matches.map((item) => item.winner);
    if (advancingPlayers.length === 1) {
      return { rounds, playerStats: stats, champion: advancingPlayers[0] };
    }

    const performanceSeed = advancingPlayers.length % 2
      ? selectPerformanceSeed(advancingPlayers, stats, random)
      : null;
    const nextRound = createRound(advancingPlayers, performanceSeed, roundIndex + 2, 'performance');
    if (performanceSeed) stats[performanceSeed].byeCount += 1;
    rounds.push(nextRound);
    return { rounds, playerStats: stats, champion: null };
  },
};

function createRound(players, seedName, roundNumber, seedReason) {
  const firstRoundSlots = [];
  if (seedName) firstRoundSlots.push(seedName, BYE);
  players.forEach((player) => { if (player !== seedName) firstRoundSlots.push(player); });
  const matchCount = Math.ceil(players.length / 2);
  return {
    name: players.length === 2 ? '冠軍賽' : `${players.length} 強`,
    seedPlayer: seedName,
    seedReason: seedName ? seedReason : null,
    matches: Array.from({ length: matchCount }, (_, index) => createMatch(
      `r${roundNumber}m${index + 1}`,
      firstRoundSlots[index * 2] || PENDING,
      firstRoundSlots[index * 2 + 1] || PENDING,
    )),
  };
}

function createMatch(id, playerA, playerB) {
  const hasBye = playerA === BYE || playerB === BYE;
  const winner = hasBye ? (playerA === BYE ? playerB : playerA) : null;
  return {
    id,
    playerA,
    playerB,
    scoreA: null,
    scoreB: null,
    winner,
    status: hasBye ? '輪空晉級' : '可開始',
  };
}

function emptyStats() {
  return { pointsFor: 0, pointsAgainst: 0, matchesPlayed: 0, byeCount: 0, wins: 0, losses: 0 };
}

function updateStats(stats, player, pointsFor, pointsAgainst) {
  stats[player] ||= emptyStats();
  stats[player].pointsFor += pointsFor;
  stats[player].pointsAgainst += pointsAgainst;
  stats[player].matchesPlayed += 1;
}

function selectPerformanceSeed(players, stats, random) {
  const ranked = players.map((player) => {
    const playerStats = stats[player] || emptyStats();
    return {
      player,
      average: playerStats.matchesPlayed ? playerStats.pointsFor / playerStats.matchesPlayed : 0,
      difference: playerStats.pointsFor - playerStats.pointsAgainst,
      byeCount: playerStats.byeCount,
      randomValue: random(),
    };
  });
  ranked.sort((a, b) => b.average - a.average
    || b.difference - a.difference
    || a.byeCount - b.byeCount
    || b.randomValue - a.randomValue);
  return ranked[0].player;
}

function deriveStats(players, rounds = []) {
  const stats = Object.fromEntries(players.map((player) => [player, emptyStats()]));
  rounds.forEach((round) => round.matches.forEach((match) => {
    if (match.status !== '已完成' || match.scoreA == null || match.scoreB == null) return;
    updateStats(stats, match.playerA, match.scoreA, match.scoreB);
    updateStats(stats, match.playerB, match.scoreB, match.scoreA);
    const winner = match.winner || (match.scoreA > match.scoreB ? match.playerA : match.playerB);
    const loser = winner === match.playerA ? match.playerB : match.playerA;
    stats[winner].wins += 1;
    stats[loser].losses += 1;
  }));
  return stats;
}

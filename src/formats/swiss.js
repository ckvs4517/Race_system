const BYE = '輪空';

export const swiss = {
  id: 'swiss',
  name: '瑞士制',

  initialSeedCount() { return 0; },

  totalRounds(players) {
    return Math.max(2, Math.ceil(Math.log2(players.length)));
  },

  createOpeningRound(players) {
    return createRound(players, 1, new Set());
  },

  initializeStats(players) {
    return Object.fromEntries(players.map((player) => [player, emptyStats()]));
  },

  activateOpeningRound(round, stats) {
    const activated = structuredClone(stats);
    applyBye(round, activated);
    return activated;
  },

  getStandings(tournament) {
    const stats = tournament.playerStats || deriveStats(tournament.players, tournament.rounds);
    return rankPlayers(tournament.players, stats).map((row, index) => ({
      ...row,
      rank: index + 1,
      isChampion: tournament.champion === row.player,
      participantStatus: tournament.participantStates?.[row.player]?.status || 'active',
    }));
  },

  rebuildStats(players, rounds) {
    return deriveStats(players, rounds);
  },

  recordResult(tournament, roundIndex, matchIndex, scoreA, scoreB) {
    const rounds = structuredClone(tournament.rounds);
    const stats = structuredClone(tournament.playerStats);
    Object.keys(stats).forEach((player) => { stats[player] = { ...emptyStats(), ...stats[player], opponents: [...(stats[player].opponents || [])] }; });
    const match = rounds[roundIndex]?.matches[matchIndex];
    if (!match || match.status !== '可開始') throw new Error('這場比賽目前無法記分。');
    if (roundIndex !== rounds.length - 1) throw new Error('只能記錄目前輪次的比賽。');
    if (scoreA === scoreB) throw new Error('比分相同時無法確認勝者。');

    completeMatch(match, stats, scoreA, scoreB);
    if (!rounds[roundIndex].matches.every((item) => Boolean(item.winner))) return { rounds, playerStats: stats, champion: null };

    const totalRounds = tournament.totalRounds || this.totalRounds(tournament.players);
    const activePlayers = tournament.players.filter((player) => isPlayerActive(tournament, player));
    if (rounds.length >= totalRounds || activePlayers.length <= 1) {
      const rankedPlayers = activePlayers.length ? activePlayers : tournament.players;
      const champion = rankPlayers(rankedPlayers, stats)[0].player;
      return { rounds, playerStats: stats, champion };
    }

    const history = pairingHistory(rounds);
    const orderedPlayers = rankPlayers(tournament.players, stats).map((row) => row.player)
      .filter((player) => isPlayerActive(tournament, player));
    const nextRound = createRound(orderedPlayers, rounds.length + 1, history, stats);
    applyBye(nextRound, stats);
    rounds.push(nextRound);
    return { rounds, playerStats: stats, champion: null };
  },
};

function createRound(orderedPlayers, roundNumber, history, stats = null) {
  const players = [...orderedPlayers];
  let byePlayer = null;
  if (players.length % 2) {
    const reversed = [...players].reverse();
    byePlayer = reversed.find((player) => !(stats?.[player]?.byeCount)) || reversed[0];
    players.splice(players.indexOf(byePlayer), 1);
  }

  const pairs = [];
  while (players.length) {
    const playerA = players.shift();
    const playerWins = stats?.[playerA]?.wins || 0;
    let opponentIndex = players.findIndex((player) => (stats?.[player]?.wins || 0) === playerWins && !history.has(pairKey(playerA, player)));
    if (opponentIndex < 0) opponentIndex = players.findIndex((player) => (stats?.[player]?.wins || 0) === playerWins);
    if (opponentIndex < 0) opponentIndex = players.findIndex((player) => !history.has(pairKey(playerA, player)));
    if (opponentIndex < 0) opponentIndex = 0;
    const playerB = players.splice(opponentIndex, 1)[0];
    pairs.push([playerA, playerB]);
  }
  if (byePlayer) pairs.push([byePlayer, BYE]);

  return {
    name: `第 ${roundNumber} 輪`,
    seedPlayer: byePlayer,
    seedReason: byePlayer ? 'swiss-bye' : null,
    matches: pairs.map(([playerA, playerB], index) => createMatch(`r${roundNumber}m${index + 1}`, playerA, playerB)),
  };
}

function createMatch(id, playerA, playerB) {
  const hasBye = playerB === BYE;
  return { id, playerA, playerB, scoreA: null, scoreB: null, winner: hasBye ? playerA : null, status: hasBye ? '輪空晉級' : '可開始' };
}

function completeMatch(match, stats, scoreA, scoreB) {
  match.scoreA = scoreA;
  match.scoreB = scoreB;
  match.winner = scoreA > scoreB ? match.playerA : match.playerB;
  match.status = '已完成';
  match.completedAt = new Date().toISOString();
  updateStats(stats, match.playerA, scoreA, scoreB);
  updateStats(stats, match.playerB, scoreB, scoreA);
  stats[match.playerA].opponents.push(match.playerB);
  stats[match.playerB].opponents.push(match.playerA);
  const loser = match.winner === match.playerA ? match.playerB : match.playerA;
  stats[match.winner].wins += 1;
  stats[loser].losses += 1;
}

function applyBye(round, stats) {
  const byeMatch = round.matches.find((match) => match.playerB === BYE);
  if (!byeMatch) return;
  stats[byeMatch.playerA].wins += 1;
  stats[byeMatch.playerA].byeCount += 1;
}

function deriveStats(players, rounds = []) {
  const stats = Object.fromEntries(players.map((player) => [player, emptyStats()]));
  rounds.forEach((round) => round.matches.forEach((match) => {
    if (match.playerB === BYE) {
      applyBye({ matches: [match] }, stats);
      return;
    }
    if (match.status !== '已完成' || match.scoreA == null || match.scoreB == null) return;
    completeMatch({ ...match }, stats, match.scoreA, match.scoreB);
  }));
  return stats;
}

function rankPlayers(players, stats) {
  return players.map((player) => {
    const playerStats = { ...emptyStats(), ...(stats[player] || {}) };
    const buchholz = (playerStats.opponents || []).reduce((sum, opponent) => sum + (stats[opponent]?.wins || 0), 0);
    return {
      player,
      wins: playerStats.wins,
      losses: playerStats.losses,
      totalPoints: playerStats.pointsFor,
      pointsAgainst: playerStats.pointsAgainst,
      difference: playerStats.pointsFor - playerStats.pointsAgainst,
      buchholz,
      byeCount: playerStats.byeCount,
    };
  }).sort((a, b) => b.wins - a.wins
    || b.buchholz - a.buchholz
    || b.difference - a.difference
    || b.totalPoints - a.totalPoints
    || a.player.localeCompare(b.player, 'zh-Hant'));
}

function pairingHistory(rounds) {
  const history = new Set();
  rounds.forEach((round) => round.matches.forEach((match) => {
    if (match.playerB !== BYE) history.add(pairKey(match.playerA, match.playerB));
  }));
  return history;
}

function pairKey(a, b) {
  return [a, b].sort().join('\u0000');
}

function emptyStats() {
  return { pointsFor: 0, pointsAgainst: 0, matchesPlayed: 0, byeCount: 0, wins: 0, losses: 0, opponents: [] };
}

function updateStats(stats, player, pointsFor, pointsAgainst) {
  stats[player] ||= emptyStats();
  stats[player].pointsFor += pointsFor;
  stats[player].pointsAgainst += pointsAgainst;
  stats[player].matchesPlayed += 1;
}

function isPlayerActive(tournament, player) {
  return (tournament.participantStates?.[player]?.status || 'active') === 'active';
}

/** 小型循環賽：每位選手互打一次，按輪次依序進行以方便現場記分。 */
const BYE = '輪空';

export const roundRobin = {
  id: 'round_robin',
  name: '循環賽（3～8 人）',
  minPlayers: 3,
  maxPlayers: 8,
  supportsOpeningPairingEdit: false,

  initialSeedCount() { return 0; },
  totalRounds(players) { return Math.max(0, players.length - 1); },
  createOpeningRound(players) { return createRoundRobinRounds(players, 'round_robin', 'round_robin', '循環賽')[0]; },
  initializeStats(players) { return emptyStatsFor(players); },
  activateOpeningRound(round, stats) { return structuredClone(stats); },
  rebuildStats(players, rounds) { return deriveStats(players, rounds); },

  getStandings(tournament) {
    const stats = deriveStats(tournament.players, tournament.rounds);
    const rows = tournament.players.map((player) => ({
      player,
      ...stats[player],
      totalPoints: stats[player].pointsFor,
      pointsAgainst: stats[player].pointsAgainst,
      difference: stats[player].pointsFor - stats[player].pointsAgainst,
      isChampion: tournament.champion === player,
      participantStatus: tournament.participantStates?.[player]?.status || 'active',
      checkedIn: tournament.participantStates?.[player]?.checkedIn !== false,
    })).sort(compareRows);
    return addSharedRanks(rows);
  },

  recordResult(tournament, roundIndex, matchIndex, scoreA, scoreB) {
    const rounds = structuredClone(tournament.rounds);
    const match = rounds[roundIndex]?.matches[matchIndex];
    if (!match || match.status !== '可開始') throw new Error('這場比賽目前無法記分。');
    if (scoreA === scoreB) throw new Error('比分相同時無法確認勝者。');
    const activeRoundIndex = rounds.findIndex((round) => round.matches.some((item) => item.status === '可開始'));
    if (roundIndex !== activeRoundIndex) throw new Error('只能記錄目前輪次的比賽。');
    completeMatch(match, scoreA, scoreB);
    if (!rounds[roundIndex].matches.every((item) => item.status === '已完成')) return { rounds, playerStats: deriveStats(tournament.players, rounds), champion: null };

    if (rounds[roundIndex].phase === 'tie_break') {
      const nextTieBreakRound = rounds.find((round) => round.phase === 'tie_break' && round.seriesId === rounds[roundIndex].seriesId && round.matches.some((item) => item.status === '等待前輪'));
      if (nextTieBreakRound) {
        nextTieBreakRound.matches.forEach((item) => { item.status = '可開始'; });
        return { rounds, playerStats: deriveStats(tournament.players, rounds), champion: null, roundRobinStage: 'tie_break' };
      }
      const tiePlayers = rounds[roundIndex].seriesPlayers || [];
      const tieStats = deriveStats(tiePlayers, rounds.filter((round) => round.phase === 'tie_break' && round.seriesId === rounds[roundIndex].seriesId));
      const tieRows = addSharedRanks(tiePlayers.map((player) => ({ player, ...tieStats[player], totalPoints: tieStats[player].pointsFor, participantStatus: 'active', checkedIn: true })).sort(compareRows));
      const champion = tieRows[0]?.rank === 1 && tieRows[1]?.rank !== 1 ? tieRows[0].player : null;
      return { rounds, playerStats: deriveStats(tournament.players, rounds), champion, roundRobinStage: champion ? 'completed' : 'tied' };
    }

    const activePlayers = tournament.players.filter((player) => tournament.participantStates?.[player]?.status === 'active');
    const standardRoundCount = activePlayers.length - 1;
    if (rounds.length < standardRoundCount) {
      const scheduledPlayers = rounds[0]?.seriesPlayers || activePlayers;
      const nextRound = createRoundRobinRounds(scheduledPlayers, 'round_robin', 'round_robin', '循環賽')[rounds.length];
      nextRound.matches.forEach((item) => { item.status = '可開始'; });
      return { rounds: [...rounds, nextRound], playerStats: deriveStats(tournament.players, [...rounds, nextRound]), champion: null };
    }

    const standings = this.getStandings({ ...tournament, rounds });
    const champion = standings[0]?.rank === 1 && standings[1]?.rank !== 1 ? standings[0].player : null;
    return { rounds, playerStats: deriveStats(tournament.players, rounds), champion, roundRobinStage: champion ? 'completed' : 'tied' };
  },
};

/** 只有原循環賽完全結束且同分時才允許建立加賽，避免一般對戰被重複配對。 */
export function startRoundRobinTieBreak(tournament, candidates) {
  if (tournament.format !== 'round_robin' || tournament.roundRobinStage !== 'tied') throw new Error('目前不能建立同分加賽。');
  const standings = roundRobin.getStandings(tournament);
  const selected = [...new Set(candidates.map(String))];
  if (selected.length < 2 || selected.length > 8) throw new Error('同分加賽需要選擇 2 至 8 位選手。');
  const rows = selected.map((player) => standings.find((row) => row.player === player));
  if (rows.some((row) => !row) || new Set(rows.map((row) => row.rank)).size !== 1 || rows[0]?.rank !== 1) throw new Error('只能選擇並列第一名的選手建立冠軍加賽。');
  const seriesId = `tie-break-${Date.now()}`;
  return { ...tournament, rounds: [...tournament.rounds, ...createRoundRobinRounds(selected, 'tie_break', seriesId, '同分加賽')], roundRobinStage: 'tie_break', updatedAt: new Date().toISOString() };
}

function createRoundRobinRounds(sourcePlayers, phase, seriesId, label) {
  const players = [...sourcePlayers];
  if (players.length % 2) players.push(BYE);
  const rounds = [];
  for (let roundIndex = 0; roundIndex < players.length - 1; roundIndex += 1) {
    const pairs = [];
    for (let index = 0; index < players.length / 2; index += 1) {
      const playerA = players[index];
      const playerB = players[players.length - 1 - index];
      if (playerA !== BYE && playerB !== BYE) pairs.push([playerA, playerB]);
    }
    rounds.push({
      name: `${label}第 ${roundIndex + 1} 輪`, phase, phaseRound: roundIndex + 1, seriesId, seriesPlayers: [...sourcePlayers],
      matches: pairs.map(([playerA, playerB], index) => ({ id: `${seriesId}-r${roundIndex + 1}m${index + 1}`, playerA, playerB, scoreA: null, scoreB: null, winner: null, status: roundIndex === 0 ? '可開始' : '等待前輪' })),
    });
    players.splice(1, 0, players.pop());
  }
  return rounds;
}

function emptyStatsFor(players) { return Object.fromEntries(players.map((player) => [player, { wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0, matchesPlayed: 0 }])); }
function deriveStats(players, rounds) {
  const stats = emptyStatsFor(players);
  rounds.forEach((round) => round.matches.forEach((match) => {
    if (match.status !== '已完成' || match.scoreA == null || match.scoreB == null) return;
    [ [match.playerA, match.scoreA, match.scoreB], [match.playerB, match.scoreB, match.scoreA] ].forEach(([player, pointsFor, pointsAgainst]) => {
      if (!stats[player]) return;
      stats[player].pointsFor += pointsFor; stats[player].pointsAgainst += pointsAgainst; stats[player].matchesPlayed += 1;
    });
    const loser = match.winner === match.playerA ? match.playerB : match.playerA;
    stats[match.winner].wins += 1; stats[loser].losses += 1;
  }));
  return stats;
}
function completeMatch(match, scoreA, scoreB) { match.scoreA = scoreA; match.scoreB = scoreB; match.winner = scoreA > scoreB ? match.playerA : match.playerB; match.status = '已完成'; match.completedAt = new Date().toISOString(); }
function compareRows(a, b) { return participantGroup(a) - participantGroup(b) || Number(b.isChampion) - Number(a.isChampion) || b.wins - a.wins || b.totalPoints - a.totalPoints || a.player.localeCompare(b.player, 'zh-Hant'); }
function participantGroup(row) { return row.participantStatus === 'no_show' || row.checkedIn === false ? 1 : 0; }
function addSharedRanks(rows) { let rank = 0; let previous = null; return rows.map((row, index) => { if (!previous || previous.wins !== row.wins || previous.totalPoints !== row.totalPoints || participantGroup(previous) !== participantGroup(row)) rank = index + 1; previous = row; return { ...row, rank }; }); }

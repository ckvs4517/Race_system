/** 守擂連勝制：勝者留在場上，敗者排到隊尾，先連勝門檻者奪冠。 */
export const winStreak = {
  id: 'win_streak', name: '連勝制／守擂（3～8 人）', minPlayers: 3, maxPlayers: 8, supportsOpeningPairingEdit: false,
  initialSeedCount() { return 0; }, totalRounds() { return null; },
  initialState() { return { winStreakTarget: 2, winStreakCount: 0, winStreakQueue: [] }; },
  createOpeningRound(players) { return createRound(players[0], players[1], 1); },
  initializeStats(players) { return Object.fromEntries(players.map((player) => [player, { wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0, matchesPlayed: 0 }])); },
  activateOpeningRound(round, stats) { return structuredClone(stats); },
  rebuildStats(players, rounds) { return deriveStats(players, rounds); },
  getStandings(tournament) {
    const stats = deriveStats(tournament.players, tournament.rounds);
    return tournament.players.map((player) => ({ player, ...stats[player], totalPoints: stats[player].pointsFor, pointsAgainst: stats[player].pointsAgainst, difference: stats[player].pointsFor - stats[player].pointsAgainst, isChampion: tournament.champion === player, participantStatus: tournament.participantStates?.[player]?.status || 'active', checkedIn: tournament.participantStates?.[player]?.checkedIn !== false }))
      .sort((a, b) => group(a) - group(b) || Number(b.isChampion) - Number(a.isChampion) || b.wins - a.wins || b.totalPoints - a.totalPoints || a.player.localeCompare(b.player, 'zh-Hant')).map((row, index) => ({ ...row, rank: index + 1 }));
  },
  recordResult(tournament, roundIndex, matchIndex, scoreA, scoreB) {
    const rounds = structuredClone(tournament.rounds); const match = rounds[roundIndex]?.matches[matchIndex];
    if (!match || match.status !== '可開始') throw new Error('這場比賽目前無法記分。');
    if (scoreA === scoreB) throw new Error('比分相同時無法確認勝者。');
    if (roundIndex !== rounds.length - 1) throw new Error('只能記錄目前守擂對戰。');
    match.scoreA = scoreA; match.scoreB = scoreB; match.winner = scoreA > scoreB ? match.playerA : match.playerB; match.status = '已完成'; match.completedAt = new Date().toISOString();
    const winner = match.winner; const loser = winner === match.playerA ? match.playerB : match.playerA;
    const count = tournament.winStreakCurrent === winner ? Number(tournament.winStreakCount || 0) + 1 : 1;
    const target = Number(tournament.winStreakTarget || 2);
    const queue = [...(tournament.winStreakQueue || [])];
    queue.push(loser);
    if (count >= target) return { rounds, playerStats: deriveStats(tournament.players, rounds), champion: winner, winStreakCurrent: winner, winStreakCount: count, winStreakQueue: queue };
    const challenger = queue.shift();
    return { rounds: [...rounds, createRound(winner, challenger, rounds.length + 1)], playerStats: deriveStats(tournament.players, rounds), champion: null, winStreakCurrent: winner, winStreakCount: count, winStreakQueue: queue };
  },
};
function createRound(playerA, playerB, number) { return { name: `守擂第 ${number} 場`, phase: 'win_streak', phaseRound: number, seriesId: 'win_streak', matches: [{ id: `win-streak-m${number}`, playerA, playerB, scoreA: null, scoreB: null, winner: null, status: '可開始' }] }; }
function deriveStats(players, rounds) { const stats = Object.fromEntries(players.map((player) => [player, { wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0, matchesPlayed: 0 }])); rounds.forEach((round) => round.matches.forEach((match) => { if (match.status !== '已完成') return; [[match.playerA, match.scoreA, match.scoreB], [match.playerB, match.scoreB, match.scoreA]].forEach(([player, own, against]) => { stats[player].pointsFor += own; stats[player].pointsAgainst += against; stats[player].matchesPlayed += 1; }); const loser = match.winner === match.playerA ? match.playerB : match.playerA; stats[match.winner].wins += 1; stats[loser].losses += 1; })); return stats; }
function group(row) { return row.participantStatus === 'no_show' || row.checkedIn === false ? 1 : 0; }

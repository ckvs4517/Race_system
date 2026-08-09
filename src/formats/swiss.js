/** 四輪瑞士制策略：四輪預賽後可直接結算，或選擇四強循環／單淘汰。 */
const BYE = '輪空';
const PRELIMINARY_ROUNDS = 4;

export const swiss = {
  id: 'swiss',
  name: '瑞士制（四輪＋彈性結算）',
  version: 2,

  initialSeedCount() { return 0; },

  totalRounds() { return PRELIMINARY_ROUNDS; },

  createOpeningRound(players) {
    return createSwissRound(players, 1, new Set());
  },

  initialState() {
    return {
      swissVersion: 2,
      swissStage: 'preliminary',
      qualifierSeriesCount: 0,
      finalists: [],
      // The preliminary Swiss ranking can either be final, feed a round robin,
      // or seed a four-player knockout. Keeping this choice on the tournament
      // preserves previously generated rounds and makes old events compatible.
      swissFinalMode: null,
    };
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
    const preliminaryRounds = tournament.rounds.filter((round) => (round.phase || 'preliminary') === 'preliminary');
    const preliminaryStats = deriveStats(tournament.players, preliminaryRounds);
  
    const preliminary = rankByRecordAndPoints(
      tournament.players,
      preliminaryStats,
      tournament,
    );

    if (!tournament.finalists?.length) {
      return addRanks(preliminary, tournament, rankingKey);
    }

    const finalRounds = tournament.rounds.filter((round) => round.phase === 'final');
    const finalStats = deriveStats(tournament.finalists, finalRounds);

    const finalists = tournament.swissFinalMode === 'single_elimination'
      ? rankSingleEliminationFinalists(tournament, finalStats)
      : rankByRecordAndPoints(
      tournament.finalists,
      finalStats,
      tournament,
      );

    const finalistSet = new Set(tournament.finalists);
    const remaining = preliminary.filter((row) => !finalistSet.has(row.player));
    return [...finalists, ...remaining].map((row, index) => ({
      ...row,
      rank: index + 1,
      isChampion: tournament.champion === row.player,
      participantStatus: tournament.participantStates?.[row.player]?.status || 'active',
      stage: finalistSet.has(row.player) ? 'final' : 'preliminary',
    }));
  },

  getPhaseStandings(tournament, phase) {
    const qualifierSeriesId = phase === 'qualifier'
      ? (tournament.activeQualifierSeriesId || [...tournament.rounds].reverse().find((round) => round.phase === 'qualifier')?.seriesId)
      : null;
    const players = phase === 'final'
      ? tournament.finalists || []
      : phase === 'qualifier'
        ? activeSeriesPlayers(tournament)
        : tournament.players;
    const rounds = tournament.rounds.filter((round) => (round.phase || 'preliminary') === phase
      && (!qualifierSeriesId || round.seriesId === qualifierSeriesId));
    const stats = deriveStats(players, rounds);
    return addRanks(
      rankByRecordAndPoints(players, stats, tournament),
      tournament,
      rankingKey,
    );
  },

  rebuildStats(players, rounds) {
    return deriveStats(players, rounds.filter((round) => (round.phase || 'preliminary') === 'preliminary'));
  },

  recordResult(tournament, roundIndex, matchIndex, scoreA, scoreB) {
    const rounds = structuredClone(tournament.rounds);
    const match = rounds[roundIndex]?.matches[matchIndex];
    const round = rounds[roundIndex];
    if (!match || match.status !== '可開始') throw new Error('這場比賽目前無法記分。');
    if (scoreA === scoreB) throw new Error('比分相同時無法確認勝者。');

    const phase = round.phase || 'preliminary';
    const activeRoundIndex = rounds.findIndex((item) => item.matches.some((candidate) => candidate.status === '可開始'));
    if (roundIndex !== activeRoundIndex) throw new Error('只能記錄目前輪次的比賽。');

    const phasePlayers = phase === 'preliminary'
      ? tournament.players
      : phase === 'final'
        ? tournament.finalists
        : round.seriesPlayers;
    const phaseRoundsBefore = rounds.filter((item, index) => index !== roundIndex && (item.phase || 'preliminary') === phase);
    const stats = deriveStats(phasePlayers, phaseRoundsBefore);
    completeMatch(match, stats, scoreA, scoreB);
    if (!round.matches.every((item) => Boolean(item.winner))) {
      return phase === 'preliminary' ? { rounds, playerStats: deriveStats(tournament.players, rounds), champion: null } : { rounds, champion: null };
    }

    const nextPhaseRound = rounds.find((item, index) => index > roundIndex
      && (item.phase || 'preliminary') === phase
      && item.seriesId === round.seriesId
      && item.matches.some((candidate) => candidate.status === '等待前輪'));
    if (nextPhaseRound) {
      activateRound(nextPhaseRound);
      return phase === 'preliminary' ? { rounds, playerStats: deriveStats(tournament.players, rounds), champion: null } : { rounds, champion: null };
    }

    if (phase === 'qualifier') {
      return { rounds, champion: null, swissStage: 'qualification', activeQualifierSeriesId: null };
    }

    if (phase === 'final') {
      if (tournament.swissFinalMode === 'single_elimination') {
        const completedFinalRounds = rounds.filter((item) => item.phase === 'final');
        const semiFinal = completedFinalRounds.find((item) => item.phaseRound === 1);
        if (semiFinal && !completedFinalRounds.some((item) => item.phaseRound === 2)) {
          rounds.push(createSingleEliminationFinalRound(semiFinal));
          return { rounds, champion: null, swissStage: 'final' };
        }
        const championship = completedFinalRounds
          .flatMap((item) => item.matches)
          .find((item) => item.id === 'swiss-final-championship');
        return { rounds, champion: championship?.winner || null, swissStage: 'completed' };
      }
      const finalStats = deriveStats(tournament.finalists, rounds.filter((item) => item.phase === 'final'));
      const finalRanking = rankByRecordAndPoints(tournament.finalists, finalStats);
      return { rounds, champion: finalRanking[0]?.player || null, swissStage: 'completed' };
    }

    const preliminaryRounds = rounds.filter((item) => (item.phase || 'preliminary') === 'preliminary');
    const preliminaryStats = deriveStats(tournament.players, preliminaryRounds);
    const activePlayers = tournament.players.filter((player) => isPlayerActive(tournament, player));
    if (preliminaryRounds.length >= PRELIMINARY_ROUNDS || activePlayers.length <= 1) {
      return { rounds, playerStats: preliminaryStats, champion: null, swissStage: 'qualification' };
    }

    const history = pairingHistory(preliminaryRounds);
    const orderedPlayers = rankByRecordAndPoints(activePlayers, preliminaryStats).map((row) => row.player);
    const nextRound = createSwissRound(orderedPlayers, preliminaryRounds.length + 1, history, preliminaryStats);
    applyBye(nextRound, preliminaryStats);
    rounds.push(nextRound);
    return { rounds, playerStats: preliminaryStats, champion: null };
  },

  startQualifier(tournament, candidates) {
    if (tournament.swissStage !== 'qualification') throw new Error('目前不能建立資格積分決定賽。');
    const unique = validateSelection(candidates, tournament.players, 2, 6, '資格加賽');
    const seriesNumber = Number(tournament.qualifierSeriesCount || 0) + 1;
    const seriesId = `qualifier-${seriesNumber}`;
    return {
      ...tournament,
      rounds: [...tournament.rounds, ...createRoundRobinRounds(unique, 'qualifier', seriesId, `資格加賽 ${seriesNumber}`)],
      swissStage: 'qualifier',
      qualifierSeriesCount: seriesNumber,
      activeQualifierSeriesId: seriesId,
      updatedAt: new Date().toISOString(),
    };
  },

  startFinal(tournament, finalists, mode = 'round_robin') {
    if (tournament.swissStage !== 'qualification') throw new Error('目前不能確認四強。');
    const unique = validateSelection(finalists, tournament.players, 4, 4, '四強');
    if (!['round_robin', 'single_elimination'].includes(mode)) throw new Error('請選擇四強決賽賽制。');
    return {
      ...tournament,
      rounds: [...tournament.rounds, ...(mode === 'round_robin'
        ? createRoundRobinRounds(unique, 'final', 'final', '四強循環決賽')
        : createSingleEliminationSemiFinals(unique))],
      finalists: unique,
      swissStage: 'final',
      swissFinalMode: mode,
      champion: null,
      updatedAt: new Date().toISOString(),
    };
  },

  completeByStandings(tournament) {
    if (tournament.swissStage !== 'qualification') throw new Error('目前不能以瑞士輪積分榜結束賽事。');
    const rows = this.getStandings(tournament);
    const leader = rows[0];
    // A tied first place is an intentional final result in this flexible mode;
    // do not incorrectly label one of the tied players as champion.
    const hasSoleLeader = leader && rows.filter((row) => row.rank === 1).length === 1;
    return {
      ...tournament,
      swissStage: 'completed',
      swissFinalMode: 'standings',
      finalists: [],
      champion: hasSoleLeader ? leader.player : null,
      status: '已完成',
      updatedAt: new Date().toISOString(),
    };
  },
};

function createSwissRound(orderedPlayers, roundNumber, history, stats = null) {
  const players = [...orderedPlayers];
  let byePlayer = null;
  if (players.length % 2) {
    const reversed = [...players].reverse();
    byePlayer = reversed.find((player) => !(stats?.[player]?.byeCount)) || reversed[0];
    players.splice(players.indexOf(byePlayer), 1);
  }

  const pairs = findPairings(players, history, stats, false) || findPairings(players, history, stats, true) || [];
  if (byePlayer) pairs.push([byePlayer, BYE]);

  return {
    name: `瑞士制第 ${roundNumber} 輪`,
    phase: 'preliminary',
    phaseRound: roundNumber,
    seriesId: 'preliminary',
    seedPlayer: byePlayer,
    seedReason: byePlayer ? 'swiss-bye' : null,
    matches: pairs.map(([playerA, playerB], index) => createMatch(`swiss-r${roundNumber}m${index + 1}`, playerA, playerB)),
  };
}

function findPairings(players, history, stats, allowRepeat) {
  if (!players.length) return [];
  const [playerA, ...remaining] = players;
  const winsA = stats?.[playerA]?.wins || 0;
  const candidates = remaining.map((player, index) => ({
    player,
    index,
    repeated: history.has(pairKey(playerA, player)),
    winDifference: Math.abs(winsA - (stats?.[player]?.wins || 0)),
  })).filter((candidate) => allowRepeat || !candidate.repeated)
    .sort((left, right) => left.repeated - right.repeated || left.winDifference - right.winDifference || left.index - right.index);

  for (const candidate of candidates) {
    const rest = remaining.filter((_, index) => index !== candidate.index);
    const tail = findPairings(rest, history, stats, allowRepeat);
    if (tail) return [[playerA, candidate.player], ...tail];
  }
  return null;
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
      name: `${label}－第 ${roundIndex + 1} 輪`,
      phase,
      phaseRound: roundIndex + 1,
      seriesId,
      seriesPlayers: [...sourcePlayers],
      matches: pairs.map(([playerA, playerB], index) => ({
        ...createMatch(`${seriesId}-r${roundIndex + 1}m${index + 1}`, playerA, playerB),
        status: roundIndex === 0 ? '可開始' : '等待前輪',
      })),
    });
    players.splice(1, 0, players.pop());
  }
  return rounds;
}

function createSingleEliminationSemiFinals(finalists) {
  return [{
    name: '四強單淘汰｜準決賽',
    phase: 'final',
    phaseRound: 1,
    seriesId: 'final',
    seriesPlayers: [...finalists],
    matches: [
      createMatch('swiss-final-semi-1', finalists[0], finalists[3]),
      createMatch('swiss-final-semi-2', finalists[1], finalists[2]),
    ],
  }];
}

function createSingleEliminationFinalRound(semiFinal) {
  const [firstSemi, secondSemi] = semiFinal.matches;
  const loserOf = (match) => match.winner === match.playerA ? match.playerB : match.playerA;
  return {
    name: '四強單淘汰｜冠軍賽與季軍賽',
    phase: 'final',
    phaseRound: 2,
    seriesId: 'final',
    seriesPlayers: [...semiFinal.seriesPlayers],
    matches: [
      createMatch('swiss-final-third-place', loserOf(firstSemi), loserOf(secondSemi)),
      createMatch('swiss-final-championship', firstSemi.winner, secondSemi.winner),
    ],
  };
}

function createMatch(id, playerA, playerB) {
  const hasBye = playerB === BYE;
  return { id, playerA, playerB, scoreA: null, scoreB: null, winner: hasBye ? playerA : null, status: hasBye ? '輪空晉級' : '可開始' };
}

function activateRound(round) {
  round.matches.forEach((match) => {
    if (match.status === '等待前輪') match.status = '可開始';
  });
}

function completeMatch(match, stats, scoreA, scoreB) {
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
}

function applyBye(round, stats) {
  const byeMatch = round.matches.find((match) => match.playerB === BYE);
  if (!byeMatch) return;
  stats[byeMatch.playerA].wins += 1;
  stats[byeMatch.playerA].byeCount += 1;
}

function deriveStats(players = [], rounds = []) {
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

function rankByRecordAndPoints(
  players,
  stats,
  tournament = null,
) {
  const order = new Map(
    players.map((player, index) => [player, index])
  );

  return rowsFor(players, stats).sort((a, b) => (
    participantRankingGroup(tournament, a.player)
      - participantRankingGroup(tournament, b.player)
    || b.wins - a.wins
    || a.losses - b.losses
    || b.totalPoints - a.totalPoints
    || order.get(a.player) - order.get(b.player)
  ));
}

function rankSingleEliminationFinalists(tournament, stats) {
  const finalMatches = tournament.rounds
    .filter((round) => round.phase === 'final')
    .flatMap((round) => round.matches);
  const championship = finalMatches.find((match) => match.id === 'swiss-final-championship');
  const thirdPlace = finalMatches.find((match) => match.id === 'swiss-final-third-place');
  if (!championship?.winner || !thirdPlace?.winner) {
    return rankByRecordAndPoints(tournament.finalists, stats, tournament);
  }
  const loserOf = (match) => match.winner === match.playerA ? match.playerB : match.playerA;
  const placement = [championship.winner, loserOf(championship), thirdPlace.winner, loserOf(thirdPlace)];
  // Bracket placement determines 1–4, except a no-show must never be moved
  // above a player who actually checked in, which is a system-wide ranking rule.
  return placement.map((player, index) => ({ ...rowsFor([player], stats)[0], placementIndex: index }))
    .sort((left, right) => participantRankingGroup(tournament, left.player) - participantRankingGroup(tournament, right.player)
      || left.placementIndex - right.placementIndex)
    .map(({ placementIndex, ...row }) => row);
}

// 未報到者保留在完整報名名單中，
// 但排行榜必須排在所有實際報到參賽者之後。
function participantRankingGroup(tournament, player) {
  const state = tournament?.participantStates?.[player];

  return state?.status === 'no_show'
    || state?.checkedIn === false
    ? 1
    : 0;
}

function rankingKey(row) {
  return `${row.wins}:${row.losses}:${row.totalPoints}`;
}

function rowsFor(players, stats) {
  return players.map((player) => {
    const playerStats = { ...emptyStats(), ...(stats[player] || {}) };
    return {
      player,
      wins: playerStats.wins,
      losses: playerStats.losses,
      totalPoints: playerStats.pointsFor,
      byeCount: playerStats.byeCount,
    };
  });
}

function addRanks(rows, tournament, scoreKey) {
  let previousScore = null;
  let previousRank = 0;
  return rows.map((row, index) => {
    const score = `${
      participantRankingGroup(tournament, row.player)
    }:${scoreKey(row)}`;
    const rank = index === 0 || score !== previousScore ? index + 1 : previousRank;
    previousScore = score;
    previousRank = rank;
    return {
      ...row,
      rank,
      isChampion: tournament.champion === row.player,
      participantStatus: tournament.participantStates?.[row.player]?.status || 'active',
    };
  });
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
  return { pointsFor: 0, pointsAgainst: 0, matchesPlayed: 0, byeCount: 0, wins: 0, losses: 0 };
}

function updateStats(stats, player, pointsFor, pointsAgainst) {
  stats[player] ||= emptyStats();
  stats[player].pointsFor += pointsFor;
  stats[player].pointsAgainst += pointsAgainst;
  stats[player].matchesPlayed += 1;
}

function validateSelection(values, allowedPlayers, minimum, maximum, label) {
  const unique = [...new Set(values.map((value) => String(value).trim()).filter(Boolean))];
  if (unique.length < minimum || unique.length > maximum) throw new Error(`${label}需要選擇 ${minimum}${minimum === maximum ? '' : ` 至 ${maximum}`} 位選手。`);
  if (unique.some((player) => !allowedPlayers.includes(player))) throw new Error(`${label}包含不在賽事中的選手。`);
  return unique;
}

function activeSeriesPlayers(tournament) {
  const round = tournament.activeQualifierSeriesId
    ? tournament.rounds.find((item) => item.seriesId === tournament.activeQualifierSeriesId)
    : [...tournament.rounds].reverse().find((item) => item.phase === 'qualifier');
  return round?.seriesPlayers || [];
}

function isPlayerActive(tournament, player) {
  return (tournament.participantStates?.[player]?.status || 'active') === 'active';
}

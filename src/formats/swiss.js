/** 四輪瑞士制策略：四輪預賽後可依賽前設定進入第二階段，並保留舊賽事流程相容性。 */
import {
  SWISS_RANKING_RULE_LEGACY,
  normalizeSwissRankingRule,
  rankSwissStandings,
} from '../domain/ranking/swiss-ranking.js';
const BYE = '輪空';
const PRELIMINARY_ROUNDS = 4;

export const swiss = {
  id: 'swiss',
  name: '瑞士制（四輪＋第二階段）',
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
      finalTieBreakCount: 0,
      swissQualifierAutomaticPlayers: [],
      swissQualifierLockedPlayers: [],
      swissQualifierSlots: 0,
      swissPlacementSeriesCount: 0,
      swissPlacementLockedChampion: null,
      activePlacementSeriesId: null,
      swissFinalTopTwo: [],
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
  
    const preliminary = rankSwissPhase(tournament, tournament.players, preliminaryStats, preliminaryRounds, PRELIMINARY_ROUNDS);

    if (!tournament.finalists?.length) {
      return preliminary;
    }

    const finalRounds = tournament.rounds.filter((round) => round.phase === 'final');
    const finalStats = deriveStats(tournament.finalists, finalRounds);

    const finalists = tournament.swissFinalMode === 'single_elimination'
      ? rankSingleEliminationFinalists(tournament, finalStats)
      : tournament.swissFinalMode === 'swiss'
        ? rankSwissStageTwoFinalists(tournament)
        : rankRoundRobinFinalists(tournament, finalStats, finalRounds);

    const finalistSet = new Set(tournament.finalists);
    const remaining = preliminary.filter((row) => !finalistSet.has(row.player));
    return [...finalists, ...remaining].map((row, index) => ({
      ...row,
      rank: finalistSet.has(row.player) ? (row.rank ?? index + 1) : index + 1,
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
      && (!qualifierSeriesId || round.seriesId === qualifierSeriesId)
      && (phase !== 'final' || tournament.swissFinalMode !== 'swiss' || round.seriesId === 'stage2-swiss'));
    const stats = deriveStats(players, rounds);
    if (phase === 'qualifier') {
      return rankRoundRobinPlayers(tournament, players, stats, rounds).map((row) => ({
        ...row,
        isChampion: false,
        participantStatus: tournament.participantStates?.[row.player]?.status || 'active',
      }));
    }
    if (phase === 'final' && tournament.swissFinalMode === 'swiss') {
      return rankSwissPhase(
        tournament,
        players,
        stats,
        rounds,
        normalizeSwissStage2Config(tournament.swissStage2Config).rounds,
      );
    }
    if (phase === 'final' && tournament.swissFinalMode !== 'single_elimination') {
      return rankRoundRobinFinalists(tournament, stats, rounds).map((row) => ({
        ...row,
        isChampion: tournament.champion === row.player,
        participantStatus: tournament.participantStates?.[row.player]?.status || 'active',
      }));
    }
    return rankSwissPhase(tournament, players, stats, rounds, PRELIMINARY_ROUNDS);
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
    const phaseRoundsBefore = rounds.filter((item, index) => index !== roundIndex
      && (item.phase || 'preliminary') === phase
      && (!['qualifier', 'placement'].includes(phase) || item.seriesId === round.seriesId));
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

    if (phase === 'placement') {
      return resolvePlacementSeries(tournament, rounds, round);
    }

    if (phase === 'final') {
      if (tournament.swissFinalMode === 'single_elimination') {
        return advanceSingleEliminationFinal(tournament, rounds);
      }
      if (tournament.swissFinalMode === 'swiss') {
        const stage2Rounds = rounds.filter((item) => item.phase === 'final' && item.seriesId === 'stage2-swiss');
        const targetRounds = normalizeSwissStage2Config(tournament.swissStage2Config).rounds;
        if (stage2Rounds.length < targetRounds) {
          const stage2Stats = deriveStats(tournament.finalists, stage2Rounds);
          const activeFinalists = tournament.finalists.filter((player) => isPlayerActive(tournament, player));
          const history = pairingHistory(stage2Rounds);
          const orderedPlayers = rankSwissPhase(
            tournament,
            activeFinalists,
            stage2Stats,
            stage2Rounds,
            targetRounds,
          ).map((row) => row.player);
          const nextRound = createSwissRound(orderedPlayers, stage2Rounds.length + 1, history, stage2Stats, {
            phase: 'final',
            seriesId: 'stage2-swiss',
            label: '第二階段瑞士輪',
            idPrefix: 'swiss-stage2',
          });
          applyBye(nextRound, stage2Stats);
          rounds.push(nextRound);
          return { rounds, champion: null, swissStage: 'final' };
        }
        const rankingTournament = { ...tournament, rounds };
        const finalRanking = rankSwissStageTwoBase(rankingTournament);
        return beginPlacementOrComplete(rankingTournament, rounds, finalRanking);
      }
      const finalRounds = rounds.filter((item) => item.phase === 'final');
      const finalStats = deriveStats(tournament.finalists, finalRounds);
      const rankingTournament = { ...tournament, rounds };
      const finalRanking = rankRoundRobinFinalists(rankingTournament, finalStats, finalRounds);
      const tiedLeaders = finalRanking.filter((row) => row.rank === 1);
      if (tiedLeaders.length > 1) {
        const seriesNumber = Number(tournament.finalTieBreakCount || 0) + 1;
        const tiedPlayers = tiedLeaders.map((row) => row.player);
        rounds.push(...createRoundRobinRounds(
          tiedPlayers,
          'final',
          `final-tiebreak-${seriesNumber}`,
          `四強同分加賽 ${seriesNumber}`,
        ));
        return {
          rounds,
          champion: null,
          finalTie: true,
          finalTieBreakCount: seriesNumber,
          swissStage: 'final',
        };
      }
      return {
        rounds,
        champion: finalRanking[0]?.player || null,
        finalTie: false,
        swissStage: 'completed',
      };
    }

    const preliminaryRounds = rounds.filter((item) => (item.phase || 'preliminary') === 'preliminary');
    const preliminaryStats = deriveStats(tournament.players, preliminaryRounds);
    const activePlayers = tournament.players.filter((player) => isPlayerActive(tournament, player));
    if (preliminaryRounds.length >= PRELIMINARY_ROUNDS || activePlayers.length <= 1) {
      return { rounds, playerStats: preliminaryStats, champion: null, swissStage: 'qualification' };
    }

    const history = pairingHistory(preliminaryRounds);
    const orderedPlayers = rankSwissPhase(
      tournament,
      activePlayers,
      preliminaryStats,
      preliminaryRounds,
      PRELIMINARY_ROUNDS,
    ).map((row) => row.player);
    const nextRound = createSwissRound(orderedPlayers, preliminaryRounds.length + 1, history, preliminaryStats);
    applyBye(nextRound, preliminaryStats);
    rounds.push(nextRound);
    return { rounds, playerStats: preliminaryStats, champion: null };
  },

  startQualifier(tournament, candidates) {
    if (tournament.swissStage !== 'qualification') throw new Error('目前不能建立資格積分決定賽。');
    const unique = validateSelection(candidates, tournament.players, 2, tournament.players.length, '資格加賽');
    const seriesNumber = Number(tournament.qualifierSeriesCount || 0) + 1;
    const seriesId = `qualifier-${seriesNumber}`;
    const configuredState = tournament.swissStage2Config
      ? prepareConfiguredQualifierState(tournament, unique)
      : {};
    return {
      ...tournament,
      ...configuredState,
      rounds: [...tournament.rounds, ...createRoundRobinRounds(unique, 'qualifier', seriesId, `資格加賽 ${seriesNumber}`)],
      swissStage: 'qualifier',
      qualifierSeriesCount: seriesNumber,
      activeQualifierSeriesId: seriesId,
      updatedAt: new Date().toISOString(),
    };
  },

  startFinal(tournament, finalists, mode = 'round_robin') {
    if (tournament.swissStage !== 'qualification') throw new Error('目前不能確認第二階段名單。');
    const configured = Boolean(tournament.swissStage2Config);
    const config = normalizeSwissStage2Config(tournament.swissStage2Config);
    const advanceCount = configured ? config.advanceCount : 4;
    const unique = validateSelection(finalists, tournament.players, advanceCount, advanceCount, configured ? `Top ${advanceCount}` : '四強');
    const selectedMode = configured ? config.format : mode;
    const allowedModes = configured ? ['single_elimination', 'swiss'] : ['round_robin', 'single_elimination'];
    if (!allowedModes.includes(selectedMode)) throw new Error('請選擇有效的第二階段賽制。');
    const finalRounds = selectedMode === 'round_robin'
      ? createRoundRobinRounds(unique, 'final', 'final', '四強循環決賽')
      : selectedMode === 'single_elimination'
        ? [createSingleEliminationOpening(unique)]
        : [createSwissRound(unique, 1, new Set(), null, {
          phase: 'final',
          seriesId: 'stage2-swiss',
          label: '第二階段瑞士輪',
          idPrefix: 'swiss-stage2',
        })];
    return {
      ...tournament,
      rounds: [...tournament.rounds, ...finalRounds],
      finalists: unique,
      swissStage: 'final',
      swissFinalMode: selectedMode,
      champion: null,
      finalTie: false,
      finalTieBreakCount: 0,
      swissPlacementSeriesCount: 0,
      swissPlacementLockedChampion: null,
      activePlacementSeriesId: null,
      swissFinalTopTwo: [],
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

function createSwissRound(orderedPlayers, roundNumber, history, stats = null, options = {}) {
  const players = [...orderedPlayers];
  let byePlayer = null;
  if (players.length % 2) {
    const reversed = [...players].reverse();
    byePlayer = reversed.find((player) => !(stats?.[player]?.byeCount)) || reversed[0];
    players.splice(players.indexOf(byePlayer), 1);
  }

  const pairs = findPairings(players, history, stats, false) || findPairings(players, history, stats, true) || [];
  if (byePlayer) pairs.push([byePlayer, BYE]);
  const phase = options.phase || 'preliminary';
  const seriesId = options.seriesId || 'preliminary';
  const label = options.label || '瑞士制';
  const idPrefix = options.idPrefix || 'swiss';

  return {
    name: phase === 'preliminary' ? `瑞士制第 ${roundNumber} 輪` : `${label}－第 ${roundNumber} 輪`,
    phase,
    phaseRound: roundNumber,
    seriesId,
    seriesPlayers: phase === 'preliminary' ? undefined : [...orderedPlayers],
    seedPlayer: byePlayer,
    seedReason: byePlayer ? 'swiss-bye' : null,
    matches: pairs.map(([playerA, playerB], index) => createMatch(`${idPrefix}-r${roundNumber}m${index + 1}`, playerA, playerB)),
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

function createSingleEliminationOpening(finalists) {
  const pairIndexes = finalists.length === 8
    ? [[0, 7], [3, 4], [1, 6], [2, 5]]
    : [[0, 3], [1, 2]];
  return {
    name: finalists.length === 8 ? '第二階段單淘汰｜8 強賽' : '四強單淘汰｜準決賽',
    phase: 'final',
    phaseRound: 1,
    seriesId: 'final',
    seriesPlayers: [...finalists],
    matches: pairIndexes.map(([left, right], index) => createMatch(`swiss-final-r1m${index + 1}`, finalists[left], finalists[right])),
  };
}

function createSingleEliminationNextRound(previousRound) {
  const winners = previousRound.matches.map((match) => match.winner);
  if (previousRound.matches.length > 2) {
    return {
      name: '第二階段單淘汰｜準決賽',
      phase: 'final',
      phaseRound: previousRound.phaseRound + 1,
      seriesId: 'final',
      seriesPlayers: [...previousRound.seriesPlayers],
      matches: [
        createMatch(`swiss-final-r${previousRound.phaseRound + 1}m1`, winners[0], winners[1]),
        createMatch(`swiss-final-r${previousRound.phaseRound + 1}m2`, winners[2], winners[3]),
      ],
    };
  }
  const loserOf = (match) => match.winner === match.playerA ? match.playerB : match.playerA;
  return {
    name: '第二階段單淘汰｜冠軍賽與季軍賽',
    phase: 'final',
    phaseRound: previousRound.phaseRound + 1,
    seriesId: 'final',
    seriesPlayers: [...previousRound.seriesPlayers],
    matches: [
      createMatch('swiss-final-third-place', loserOf(previousRound.matches[0]), loserOf(previousRound.matches[1])),
      createMatch('swiss-final-championship', winners[0], winners[1]),
    ],
  };
}

function advanceSingleEliminationFinal(tournament, rounds) {
  const finalRounds = rounds.filter((item) => item.phase === 'final');
  const latest = finalRounds.at(-1);
  const championship = finalRounds.flatMap((item) => item.matches).find((item) => item.id === 'swiss-final-championship');
  if (championship?.winner) return { rounds, champion: championship.winner, swissStage: 'completed' };
  rounds.push(createSingleEliminationNextRound(latest));
  return { rounds, champion: null, swissStage: 'final' };
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

function rankSwissPhase(tournament, players, stats, rounds, totalRounds) {
  return rankSwissStandings({
    players,
    stats,
    rounds,
    participantStates: tournament?.participantStates || {},
    rule: normalizeSwissRankingRule(tournament?.swissRankingRule, SWISS_RANKING_RULE_LEGACY),
    totalRounds,
  }).map((row) => ({
    ...row,
    isChampion: tournament?.champion === row.player,
    participantStatus: tournament?.participantStates?.[row.player]?.status || 'active',
  }));
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

function rankRoundRobinFinalists(tournament, stats, rounds) {
  return rankRoundRobinPlayers(tournament, tournament.finalists, stats, rounds);
}

function rankRoundRobinPlayers(tournament, players, stats, rounds) {
  const ranked = rankByRecordAndPoints(players, stats, tournament);
  const result = [];
  let index = 0;

  while (index < ranked.length) {
    const score = finalStandingKey(tournament, ranked[index]);
    const tied = [];
    while (index + tied.length < ranked.length
      && finalStandingKey(tournament, ranked[index + tied.length]) === score) {
      tied.push(ranked[index + tied.length]);
    }

    const baseRank = index + 1;
    if (tied.length === 2) {
      const winner = latestHeadToHeadWinner(rounds, tied[0].player, tied[1].player);
      if (winner) {
        tied.sort((left, right) => (left.player === winner ? -1 : right.player === winner ? 1 : 0));
        tied.forEach((row, offset) => result.push({ ...row, rank: baseRank + offset }));
      } else {
        tied.forEach((row) => result.push({ ...row, rank: baseRank }));
      }
    } else if (tied.length > 1) {
      tied.forEach((row) => result.push({ ...row, rank: baseRank }));
    } else {
      result.push({ ...tied[0], rank: baseRank });
    }
    index += tied.length;
  }

  return result;
}

function finalStandingKey(tournament, row) {
  return `${participantRankingGroup(tournament, row.player)}:${rankingKey(row)}`;
}

function latestHeadToHeadWinner(rounds, playerA, playerB) {
  for (let roundIndex = rounds.length - 1; roundIndex >= 0; roundIndex -= 1) {
    const matches = rounds[roundIndex].matches || [];
    for (let matchIndex = matches.length - 1; matchIndex >= 0; matchIndex -= 1) {
      const match = matches[matchIndex];
      if (!match.winner) continue;
      const samePair = (match.playerA === playerA && match.playerB === playerB)
        || (match.playerA === playerB && match.playerB === playerA);
      if (samePair) return match.winner;
    }
  }
  return null;
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
  const topFour = [championship.winner, loserOf(championship), thirdPlace.winner, loserOf(thirdPlace)];
  const topSet = new Set(topFour);
  const remaining = tournament.finalists.filter((player) => !topSet.has(player));
  return [...topFour, ...remaining].map((player, index) => ({
    ...rowsFor([player], stats)[0],
    placementIndex: index,
  }))
    .sort((left, right) => participantRankingGroup(tournament, left.player) - participantRankingGroup(tournament, right.player)
      || left.placementIndex - right.placementIndex)
    .map(({ placementIndex, ...row }) => row);
}

function normalizeSwissStage2Config(value = {}) {
  return {
    advanceCount: Number(value?.advanceCount) === 8 ? 8 : 4,
    format: value?.format === 'swiss' ? 'swiss' : 'single_elimination',
    rounds: Math.min(8, Math.max(1, Number(value?.rounds) || 4)),
  };
}

function preliminaryRanking(tournament) {
  const preliminaryRounds = tournament.rounds.filter((round) => (round.phase || 'preliminary') === 'preliminary');
  const stats = deriveStats(tournament.players, preliminaryRounds);
  return rankSwissPhase(tournament, tournament.players, stats, preliminaryRounds, PRELIMINARY_ROUNDS);
}

function advancementCut(rows, slots) {
  if (slots <= 0 || rows.length <= slots) return { needsTieBreak: false, automatic: rows.slice(0, slots), tied: [], openSlots: 0 };
  const cutoff = rows[slots - 1];
  const automatic = rows.filter((row) => row.rank < cutoff.rank);
  const tied = rows.filter((row) => row.rank === cutoff.rank);
  const openSlots = Math.max(0, slots - automatic.length);
  return { needsTieBreak: tied.length > openSlots, automatic, tied, openSlots };
}

function latestQualifierRows(tournament) {
  const latest = [...tournament.rounds].reverse().find((round) => round.phase === 'qualifier');
  if (!latest) return [];
  const rounds = tournament.rounds.filter((round) => round.phase === 'qualifier' && round.seriesId === latest.seriesId);
  const stats = deriveStats(latest.seriesPlayers || [], rounds);
  return rankRoundRobinPlayers(tournament, latest.seriesPlayers || [], stats, rounds);
}

function prepareConfiguredQualifierState(tournament, nextCandidates) {
  const config = normalizeSwissStage2Config(tournament.swissStage2Config);
  let automaticPlayers = [...(tournament.swissQualifierAutomaticPlayers || [])];
  let lockedPlayers = [...(tournament.swissQualifierLockedPlayers || [])];
  let slots = Number(tournament.swissQualifierSlots || 0);
  if (!tournament.qualifierSeriesCount || !slots) {
    const cut = advancementCut(preliminaryRanking(tournament), config.advanceCount);
    automaticPlayers = cut.automatic.map((row) => row.player);
    lockedPlayers = [];
    slots = cut.openSlots;
  } else {
    const previousRows = latestQualifierRows(tournament);
    const remainingSlots = Math.max(0, slots - lockedPlayers.length);
    const cut = advancementCut(previousRows, remainingSlots);
    const candidateSet = new Set(nextCandidates);
    cut.automatic.forEach((row) => {
      if (!candidateSet.has(row.player) && !lockedPlayers.includes(row.player)) lockedPlayers.push(row.player);
    });
  }
  return {
    swissQualifierAutomaticPlayers: automaticPlayers,
    swissQualifierLockedPlayers: lockedPlayers,
    swissQualifierSlots: slots,
  };
}

function stageTwoSwissRounds(tournament, rounds = tournament.rounds) {
  return rounds.filter((round) => round.phase === 'final' && round.seriesId === 'stage2-swiss');
}

function rankSwissStageTwoBase(tournament) {
  const rounds = stageTwoSwissRounds(tournament);
  const stats = deriveStats(tournament.finalists || [], rounds);
  return rankSwissPhase(
    tournament,
    tournament.finalists || [],
    stats,
    rounds,
    normalizeSwissStage2Config(tournament.swissStage2Config).rounds,
  );
}

function rankSwissStageTwoFinalists(tournament) {
  const base = rankSwissStageTwoBase(tournament);
  const topTwo = Array.isArray(tournament.swissFinalTopTwo) ? tournament.swissFinalTopTwo : [];
  if (topTwo.length < 2) return base;
  const rowByPlayer = new Map(base.map((row) => [row.player, row]));
  const topRows = topTwo.map((player, index) => ({
    ...(rowByPlayer.get(player) || rowsFor([player], {})[0]),
    rank: index + 1,
    isChampion: index === 0,
  }));
  const topSet = new Set(topTwo);
  const remaining = base.filter((row) => !topSet.has(row.player)).map((row, index) => ({ ...row, rank: index + 3, isChampion: false }));
  return [...topRows, ...remaining];
}

function topTwoTieState(ranking) {
  const firstGroup = ranking.filter((row) => row.rank === 1);
  if (firstGroup.length > 1) return { candidates: firstGroup.map((row) => row.player), lockedChampion: null };
  const second = ranking[1];
  if (!second) return null;
  const secondGroup = ranking.filter((row) => row.rank === second.rank);
  if (secondGroup.length > 1) return { candidates: secondGroup.map((row) => row.player), lockedChampion: ranking[0].player };
  return null;
}

function beginPlacementSeries(tournament, rounds, candidates, lockedChampion) {
  const seriesNumber = Number(tournament.swissPlacementSeriesCount || 0) + 1;
  const seriesId = `placement-${seriesNumber}`;
  return {
    rounds: [...rounds, ...createRoundRobinRounds(candidates, 'placement', seriesId, `冠亞名次加賽 ${seriesNumber}`)],
    champion: null,
    swissStage: 'final',
    swissPlacementSeriesCount: seriesNumber,
    swissPlacementLockedChampion: lockedChampion || null,
    activePlacementSeriesId: seriesId,
  };
}

function completeSwissStageTwo(rounds, topTwo) {
  return {
    rounds,
    champion: topTwo[0] || null,
    swissFinalTopTwo: topTwo,
    swissStage: 'completed',
    swissPlacementLockedChampion: null,
    activePlacementSeriesId: null,
  };
}

function beginPlacementOrComplete(tournament, rounds, ranking) {
  const tie = topTwoTieState(ranking);
  if (tie) return beginPlacementSeries(tournament, rounds, tie.candidates, tie.lockedChampion);
  return completeSwissStageTwo(rounds, ranking.slice(0, 2).map((row) => row.player));
}

function resolvePlacementSeries(tournament, rounds, completedRound) {
  const seriesId = completedRound.seriesId;
  const seriesRounds = rounds.filter((round) => round.phase === 'placement' && round.seriesId === seriesId);
  const players = completedRound.seriesPlayers || [];
  const stats = deriveStats(players, seriesRounds);
  const ranked = rankRoundRobinPlayers(tournament, players, stats, seriesRounds);
  const lockedChampion = tournament.swissPlacementLockedChampion || null;
  const firstGroup = ranked.filter((row) => row.rank === 1);
  if (firstGroup.length > 1) {
    return beginPlacementSeries(tournament, rounds, firstGroup.map((row) => row.player), lockedChampion);
  }
  if (lockedChampion) return completeSwissStageTwo(rounds, [lockedChampion, ranked[0].player]);
  const second = ranked[1];
  const secondGroup = ranked.filter((row) => row.rank === second?.rank);
  if (secondGroup.length > 1) {
    return beginPlacementSeries(tournament, rounds, secondGroup.map((row) => row.player), ranked[0].player);
  }
  return completeSwissStageTwo(rounds, ranked.slice(0, 2).map((row) => row.player));
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

import { getTournamentFormat } from '../formats/registry.js';

const BYE = '輪空';
const PENDING = '待定';

export function nextPowerOfTwo(value) {
  return 2 ** Math.ceil(Math.log2(Math.max(2, value)));
}

export function requiredSeedCount(tournamentOrPlayers) {
  const tournament = Array.isArray(tournamentOrPlayers)
    ? { players: tournamentOrPlayers, format: 'single_elimination' }
    : tournamentOrPlayers;
  return getTournamentFormat(tournament.format).initialSeedCount(tournament.players);
}

export function createTournament(name, players, formatId = 'single_elimination', arenaCount = 1) {
  const cleanPlayers = players.map((player) => player.trim()).filter(Boolean);
  validatePlayers(cleanPlayers);
  const cleanArenaCount = validateArenaCount(arenaCount);
  const format = getTournamentFormat(formatId);
  const seedCount = format.initialSeedCount(cleanPlayers);
  return {
    id: Date.now(),
    name: name.trim() || '未命名賽事',
    format: format.id,
    bracketVersion: 2,
    players: cleanPlayers,
    arenaCount: cleanArenaCount,
    seedPlayerIndexes: [],
    created: new Date().toLocaleDateString('zh-TW'),
    status: '準備中',
    totalRounds: format.totalRounds?.(cleanPlayers) || null,
    rounds: seedCount ? [] : [format.createOpeningRound(cleanPlayers)],
  };
}

export function duplicateTournament(tournament) {
  const normalized = normalizeTournament(tournament);
  return createTournament(`${normalized.name}（副本）`, normalized.players, normalized.format, normalized.arenaCount);
}

export function updateDraftTournament(tournament, name, players, formatId = tournament.format, arenaCount = tournament.arenaCount || 1) {
  if (tournament.status !== '準備中') throw new Error('賽事開始後不能再修改參賽名單。');
  const cleanPlayers = players.map((player) => player.trim()).filter(Boolean);
  validatePlayers(cleanPlayers);
  const cleanArenaCount = validateArenaCount(arenaCount);
  const format = getTournamentFormat(formatId);
  const seedCount = format.initialSeedCount(cleanPlayers);
  return {
    ...tournament,
    name: name.trim() || '未命名賽事',
    bracketVersion: 2,
    format: format.id,
    players: cleanPlayers,
    arenaCount: cleanArenaCount,
    seedPlayerIndexes: [],
    totalRounds: format.totalRounds?.(cleanPlayers) || null,
    rounds: seedCount ? [] : [format.createOpeningRound(cleanPlayers)],
    seedDrawnAt: null,
    updatedAt: new Date().toISOString(),
  };
}

export function drawRandomSeeds(tournament, random = Math.random) {
  const normalized = normalizeTournament(tournament);
  if (normalized.status !== '準備中') throw new Error('賽事開始後不能重新抽選種子。');
  const format = getTournamentFormat(normalized.format);
  const seedCount = format.initialSeedCount(normalized.players);
  if (seedCount === 0) return normalized;

  const indexes = normalized.players.map((_, index) => index);
  for (let index = indexes.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [indexes[index], indexes[swapIndex]] = [indexes[swapIndex], indexes[index]];
  }
  const seedPlayerIndexes = indexes.slice(0, seedCount);
  return {
    ...normalized,
    seedPlayerIndexes,
    rounds: [format.createOpeningRound(normalized.players, seedPlayerIndexes)],
    seedDrawnAt: new Date().toISOString(),
  };
}

export function randomizeDraftTournament(tournament, random = Math.random) {
  const normalized = normalizeTournament(tournament);
  if (normalized.status !== '準備中') throw new Error('賽事開始後不能重新隨機分組。');
  const players = [...normalized.players];
  for (let index = players.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [players[index], players[swapIndex]] = [players[swapIndex], players[index]];
  }
  const format = getTournamentFormat(normalized.format);
  const seedCount = format.initialSeedCount(players);
  return {
    ...normalized,
    players,
    seedPlayerIndexes: [],
    totalRounds: format.totalRounds?.(players) || null,
    rounds: seedCount ? [] : [format.createOpeningRound(players)],
    seedDrawnAt: null,
    randomizedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function startTournament(tournament) {
  const normalized = normalizeTournament(tournament);
  const format = getTournamentFormat(normalized.format);
  if (normalized.status !== '準備中') throw new Error('這場賽事已經開始或完成。');
  if (normalized.seedPlayerIndexes.length !== format.initialSeedCount(normalized.players)) {
    throw new Error('請先完成種子選手抽選再開始賽事。');
  }
  const stats = format.initializeStats(normalized.players);
  return {
    ...normalized,
    status: '進行中',
    playerStats: format.activateOpeningRound(normalized.rounds[0], stats),
    startedAt: new Date().toISOString(),
  };
}

export function normalizeTournament(tournament) {
  if (tournament.bracketVersion === 2) {
    const format = getTournamentFormat(tournament.format || 'single_elimination');
    return {
      ...tournament,
      format: format.id,
      arenaCount: normalizeStoredArenaCount(tournament.arenaCount),
      totalRounds: tournament.totalRounds || format.totalRounds?.(tournament.players || []) || null,
    };
  }

  const players = tournament.players || [];
  const hasRounds = Array.isArray(tournament.rounds) && tournament.rounds.length > 0;
  const hasCompletedMatch = hasRounds && tournament.rounds.some((round) => round.matches.some((match) => match.status === '已完成'));
  const isActiveLegacy = tournament.status === '已完成' || tournament.startedAt || hasCompletedMatch;
  if (isActiveLegacy) {
    return {
      ...tournament,
      format: 'single_elimination',
      arenaCount: 1,
      bracketVersion: 1,
      status: tournament.status === '已完成' ? '已完成' : '進行中',
      rounds: hasRounds ? advanceLegacyWins(tournament.rounds) : [],
    };
  }

  const migrated = createTournament(tournament.name, players, 'single_elimination');
  return { ...migrated, id: tournament.id, created: tournament.created || migrated.created };
}

export function buildRounds(tournament) {
  const normalized = normalizeTournament(tournament);
  if (normalized.bracketVersion === 1) return normalized.rounds;
  if (normalized.format !== 'single_elimination') return structuredClone(normalized.rounds);
  return projectFutureRounds(normalized.rounds);
}

export function getTournamentStandings(tournament) {
  const normalized = normalizeTournament(tournament);
  return getTournamentFormat(normalized.format).getStandings(normalized);
}

export function resetCompletedMatch(tournament, roundIndex, matchIndex) {
  const normalized = normalizeTournament(tournament);
  if (normalized.bracketVersion !== 2) throw new Error('舊版進行中賽事不支援回退比賽。');
  if (normalized.status !== '進行中' && normalized.status !== '已完成') throw new Error('這場賽事目前不能重新比賽。');
  const rounds = structuredClone(normalized.rounds.slice(0, roundIndex + 1));
  const match = rounds[roundIndex]?.matches[matchIndex];
  if (!match || match.status !== '已完成') throw new Error('只有已完成的比賽可以重新開始。');

  match.scoreA = null;
  match.scoreB = null;
  match.winner = null;
  match.status = '可開始';
  delete match.completedAt;
  const format = getTournamentFormat(normalized.format);
  return {
    ...normalized,
    rounds,
    playerStats: format.rebuildStats(normalized.players, rounds),
    champion: null,
    status: '進行中',
    updatedAt: new Date().toISOString(),
  };
}

export function recordMatchResult(tournament, roundIndex, matchIndex, scoreA, scoreB, random = Math.random) {
  const normalized = normalizeTournament(tournament);
  if (normalized.status !== '進行中') throw new Error('賽事尚未開始或已經完成。');
  if (normalized.bracketVersion === 1) return recordLegacyResult(normalized, roundIndex, matchIndex, scoreA, scoreB);

  const format = getTournamentFormat(normalized.format);
  const result = format.recordResult(normalized, roundIndex, matchIndex, scoreA, scoreB, random);
  return {
    ...normalized,
    ...result,
    status: result.champion ? '已完成' : '進行中',
  };
}

function projectFutureRounds(sourceRounds) {
  const rounds = structuredClone(sourceRounds);
  if (!rounds.length) return rounds;
  let entrantCount = rounds.at(-1).matches.length;
  let roundNumber = rounds.length + 1;
  while (entrantCount > 1) {
    const matchCount = Math.ceil(entrantCount / 2);
    rounds.push({
      name: entrantCount === 2 ? '冠軍賽' : `${entrantCount} 強`,
      projected: true,
      seedPlayer: null,
      seedReason: null,
      matches: Array.from({ length: matchCount }, (_, index) => ({
        id: `projected-r${roundNumber}m${index + 1}`,
        playerA: PENDING,
        playerB: PENDING,
        scoreA: null,
        scoreB: null,
        winner: null,
        status: '等待晉級',
      })),
    });
    entrantCount = matchCount;
    roundNumber += 1;
  }
  return rounds;
}

function validatePlayers(players) {
  if (players.length < 2 || players.length > 32) throw new Error('參賽者人數需要介於 2 至 32 位。');
  if (new Set(players).size !== players.length) throw new Error('參賽者名稱不可重複。');
}

function validateArenaCount(value) {
  const count = Number(value);
  if (!Number.isInteger(count) || count < 1 || count > 8) throw new Error('戰鬥台數需要介於 1 至 8 台。');
  return count;
}

function normalizeStoredArenaCount(value) {
  const count = Number(value);
  return Number.isInteger(count) && count >= 1 && count <= 8 ? count : 1;
}

function recordLegacyResult(tournament, roundIndex, matchIndex, scoreA, scoreB) {
  const rounds = structuredClone(tournament.rounds);
  const match = rounds[roundIndex]?.matches[matchIndex];
  if (!match || match.status !== '可開始') throw new Error('這場比賽目前無法記分。');
  if (scoreA === scoreB) throw new Error('比分相同時無法確認勝者。');
  match.scoreA = scoreA;
  match.scoreB = scoreB;
  match.winner = scoreA > scoreB ? match.playerA : match.playerB;
  match.status = '已完成';
  match.completedAt = new Date().toISOString();
  const updatedRounds = advanceLegacyWins(rounds);
  const champion = updatedRounds.at(-1).matches[0].winner;
  return { ...tournament, rounds: updatedRounds, champion: champion || null, status: champion ? '已完成' : '進行中' };
}

function advanceLegacyWins(sourceRounds) {
  const rounds = structuredClone(sourceRounds);
  rounds.forEach((round, roundIndex) => {
    round.matches.forEach((match, matchIndex) => {
      if (!match.winner && match.status !== '已完成') {
        const realPlayers = [match.playerA, match.playerB].filter((player) => player !== BYE && player !== PENDING);
        if (realPlayers.length === 1 && [match.playerA, match.playerB].includes(BYE)) {
          match.winner = realPlayers[0];
          match.status = '輪空晉級';
        }
      }
      if (!match.winner || roundIndex === rounds.length - 1) return;
      const nextMatch = rounds[roundIndex + 1].matches[Math.floor(matchIndex / 2)];
      if (matchIndex % 2 === 0) nextMatch.playerA = match.winner;
      else nextMatch.playerB = match.winner;
      if (!nextMatch.winner && nextMatch.playerA !== PENDING && nextMatch.playerB !== PENDING) nextMatch.status = '可開始';
    });
  });
  return rounds;
}

const BYE = '輪空';
const PENDING = '待定';

export function nextPowerOfTwo(value) {
  return 2 ** Math.ceil(Math.log2(Math.max(2, value)));
}

export function requiredSeedCount(tournamentOrPlayers) {
  const players = Array.isArray(tournamentOrPlayers) ? tournamentOrPlayers : tournamentOrPlayers.players;
  return nextPowerOfTwo(players.length) - players.length;
}

export function createTournament(name, players) {
  const cleanPlayers = players.map((player) => player.trim()).filter(Boolean);
  validatePlayerCount(cleanPlayers);
  const needsSeedDraw = requiredSeedCount(cleanPlayers) > 0;

  return {
    id: Date.now(),
    name: name.trim() || '未命名賽事',
    players: cleanPlayers,
    seedPlayerIndexes: [],
    created: new Date().toLocaleDateString('zh-TW'),
    status: '準備中',
    rounds: needsSeedDraw ? [] : advanceAutomaticWins(createRounds(cleanPlayers, [])),
  };
}

export function updateDraftTournament(tournament, name, players) {
  if (tournament.status !== '準備中') throw new Error('賽事開始後不能再修改參賽名單。');
  const cleanPlayers = players.map((player) => player.trim()).filter(Boolean);
  validatePlayerCount(cleanPlayers);
  const needsSeedDraw = requiredSeedCount(cleanPlayers) > 0;
  return {
    ...tournament,
    name: name.trim() || '未命名賽事',
    players: cleanPlayers,
    seedPlayerIndexes: [],
    rounds: needsSeedDraw ? [] : advanceAutomaticWins(createRounds(cleanPlayers, [])),
    seedDrawnAt: null,
    updatedAt: new Date().toISOString(),
  };
}

export function drawRandomSeeds(tournament, random = Math.random) {
  const normalized = normalizeTournament(tournament);
  if (normalized.status !== '準備中') throw new Error('賽事開始後不能重新抽選種子。');
  const seedCount = requiredSeedCount(normalized);
  if (seedCount === 0) return normalized;

  const indexes = normalized.players.map((_, index) => index);
  for (let index = indexes.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [indexes[index], indexes[swapIndex]] = [indexes[swapIndex], indexes[index]];
  }
  const seedPlayerIndexes = indexes.slice(0, seedCount).sort((a, b) => a - b);
  return {
    ...normalized,
    seedPlayerIndexes,
    rounds: advanceAutomaticWins(createRounds(normalized.players, seedPlayerIndexes)),
    seedDrawnAt: new Date().toISOString(),
  };
}

export function startTournament(tournament) {
  const normalized = normalizeTournament(tournament);
  if (normalized.status !== '準備中') throw new Error('這場賽事已經開始或完成。');
  if (normalized.seedPlayerIndexes.length !== requiredSeedCount(normalized)) {
    throw new Error('請先完成種子選手抽選再開始賽事。');
  }
  return {
    ...normalized,
    status: '進行中',
    startedAt: new Date().toISOString(),
  };
}

export function normalizeTournament(tournament) {
  const players = tournament.players || [];
  const hasRounds = Array.isArray(tournament.rounds) && tournament.rounds.length > 0;
  const hasCompletedMatch = hasRounds && tournament.rounds.some((round) => round.matches.some((match) => match.status === '已完成'));
  const status = tournament.status === '已完成'
    ? '已完成'
    : tournament.status === '進行中' && (tournament.startedAt || hasCompletedMatch) ? '進行中' : '準備中';
  const seedCount = requiredSeedCount(players);
  const hasStoredSeedSelection = Array.isArray(tournament.seedPlayerIndexes);
  const inferredIndexes = inferSeedIndexes(tournament.rounds, players);
  const candidateIndexes = hasStoredSeedSelection ? tournament.seedPlayerIndexes : inferredIndexes;
  const seedPlayerIndexes = candidateIndexes.filter((index) => Number.isInteger(index) && index >= 0 && index < players.length).slice(0, seedCount);
  const resetLegacyDraftSeeds = status === '準備中' && seedCount > 0 && !hasStoredSeedSelection;

  if (hasRounds) {
    if (resetLegacyDraftSeeds) return { ...tournament, status, seedPlayerIndexes: [], rounds: [] };
    return { ...tournament, status, seedPlayerIndexes, rounds: advanceAutomaticWins(tournament.rounds) };
  }
  const canBuildRounds = seedCount === 0 || seedPlayerIndexes.length === seedCount;
  return {
    ...tournament,
    status,
    seedPlayerIndexes,
    rounds: canBuildRounds ? advanceAutomaticWins(createRounds(players, seedPlayerIndexes)) : [],
  };
}

export function buildRounds(tournament) {
  return normalizeTournament(tournament).rounds;
}

export function recordMatchResult(tournament, roundIndex, matchIndex, scoreA, scoreB) {
  const normalized = normalizeTournament(tournament);
  if (normalized.status !== '進行中') throw new Error('賽事尚未開始或已經完成。');
  const rounds = structuredClone(normalized.rounds);
  const match = rounds[roundIndex]?.matches[matchIndex];
  if (!match || match.status !== '可開始') throw new Error('這場比賽目前無法記分。');
  if (scoreA === scoreB) throw new Error('比分相同時無法確認勝者。');

  match.scoreA = scoreA;
  match.scoreB = scoreB;
  match.winner = scoreA > scoreB ? match.playerA : match.playerB;
  match.status = '已完成';
  match.completedAt = new Date().toISOString();

  const updatedRounds = advanceAutomaticWins(rounds);
  const champion = updatedRounds.at(-1).matches[0].winner;
  return {
    ...normalized,
    rounds: updatedRounds,
    status: champion ? '已完成' : '進行中',
    champion: champion || null,
  };
}

function createRounds(players, seedPlayerIndexes) {
  const size = nextPowerOfTwo(players.length);
  const seedSet = new Set(seedPlayerIndexes);
  const firstRoundSlots = [];

  seedPlayerIndexes.forEach((playerIndex) => firstRoundSlots.push(players[playerIndex], BYE));
  players.forEach((player, index) => { if (!seedSet.has(index)) firstRoundSlots.push(player); });

  const rounds = [];
  let matchCount = size / 2;
  rounds.push({
    name: roundName(size, matchCount),
    matches: Array.from({ length: matchCount }, (_, index) => createMatch(
      `r1m${index + 1}`,
      firstRoundSlots[index * 2] || BYE,
      firstRoundSlots[index * 2 + 1] || BYE,
    )),
  });

  let roundNumber = 2;
  while (matchCount > 1) {
    matchCount /= 2;
    rounds.push({
      name: roundName(size, matchCount),
      matches: Array.from({ length: matchCount }, (_, index) => createMatch(`r${roundNumber}m${index + 1}`)),
    });
    roundNumber += 1;
  }
  return rounds;
}

function inferSeedIndexes(rounds, players) {
  if (!Array.isArray(rounds) || !rounds[0]) return [];
  return rounds[0].matches.flatMap((match) => {
    const hasBye = match.playerA === BYE || match.playerB === BYE;
    const player = match.playerA === BYE ? match.playerB : match.playerA;
    const index = hasBye ? players.indexOf(player) : -1;
    return index >= 0 ? [index] : [];
  });
}

function validatePlayerCount(players) {
  if (players.length < 2 || players.length > 32) throw new Error('參賽者人數需要介於 2 至 32 位。');
}

function createMatch(id, playerA = PENDING, playerB = PENDING) {
  return { id, playerA, playerB, scoreA: null, scoreB: null, winner: null, status: matchStatus(playerA, playerB) };
}

function roundName(size, matchCount) {
  if (matchCount === 1) return '冠軍賽';
  if (matchCount === 2) return '準決賽';
  return `${size} 強`;
}

function matchStatus(playerA, playerB) {
  if (playerA === PENDING || playerB === PENDING) return '等待晉級';
  if (playerA === BYE || playerB === BYE) return '輪空晉級';
  return '可開始';
}

function advanceAutomaticWins(sourceRounds) {
  const rounds = structuredClone(sourceRounds);
  rounds.forEach((round, roundIndex) => {
    round.matches.forEach((match, matchIndex) => {
      if (!match.winner && match.status !== '已完成') {
        const realPlayers = [match.playerA, match.playerB].filter((player) => player !== BYE && player !== PENDING);
        if (realPlayers.length === 1 && [match.playerA, match.playerB].includes(BYE)) {
          match.winner = realPlayers[0];
          match.status = '輪空晉級';
        } else {
          match.status = matchStatus(match.playerA, match.playerB);
        }
      }

      if (!match.winner || roundIndex === rounds.length - 1) return;
      const nextMatch = rounds[roundIndex + 1].matches[Math.floor(matchIndex / 2)];
      if (matchIndex % 2 === 0) nextMatch.playerA = match.winner;
      else nextMatch.playerB = match.winner;
      if (!nextMatch.winner) nextMatch.status = matchStatus(nextMatch.playerA, nextMatch.playerB);
    });
  });
  return rounds;
}

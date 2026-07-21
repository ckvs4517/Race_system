const BYE = '輪空';
const PENDING = '待定';

export function nextPowerOfTwo(value) {
  return 2 ** Math.ceil(Math.log2(Math.max(2, value)));
}

export function createTournament(name, players) {
  const cleanPlayers = players.map((player) => player.trim()).filter(Boolean);
  const rounds = createRounds(cleanPlayers);

  return {
    id: Date.now(),
    name: name.trim() || '未命名賽事',
    players: cleanPlayers,
    created: new Date().toLocaleDateString('zh-TW'),
    status: '進行中',
    rounds: advanceAutomaticWins(rounds),
  };
}

export function normalizeTournament(tournament) {
  if (Array.isArray(tournament.rounds) && tournament.rounds.length) {
    return { ...tournament, rounds: advanceAutomaticWins(tournament.rounds) };
  }
  return {
    ...tournament,
    status: tournament.status === '準備中' ? '進行中' : tournament.status,
    rounds: advanceAutomaticWins(createRounds(tournament.players || [])),
  };
}

export function buildRounds(tournament) {
  return normalizeTournament(tournament).rounds;
}

export function recordMatchResult(tournament, roundIndex, matchIndex, scoreA, scoreB) {
  const normalized = normalizeTournament(tournament);
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

function createRounds(players) {
  const size = nextPowerOfTwo(players.length);
  const byeCount = size - players.length;
  const firstRoundSlots = [];

  for (let index = 0; index < byeCount; index += 1) {
    firstRoundSlots.push(players[index], BYE);
  }
  for (let index = byeCount; index < players.length; index += 1) {
    firstRoundSlots.push(players[index]);
  }

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

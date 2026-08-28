/** Compatibility operations for pre-V2 single-elimination tournament records. */
import { BYE, PENDING } from './constants.js';

export function recordLegacyResult(tournament, roundIndex, matchIndex, scoreA, scoreB) {
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

export function advanceLegacyWins(sourceRounds) {
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

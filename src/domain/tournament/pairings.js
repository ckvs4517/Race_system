/** Shared opening-pair validation and projected bracket helpers. */
import { BYE, PENDING } from './constants.js';

export function validateOpeningPairs(pairs, activePlayers) {
  if (!Array.isArray(pairs)) throw new Error('賽程格式不正確。');
  const expectedMatchCount = Math.ceil(activePlayers.length / 2);
  if (pairs.length !== expectedMatchCount) throw new Error(`首輪需要 ${expectedMatchCount} 場配對。`);
  const cleanPairs = pairs.map((pair) => {
    if (!Array.isArray(pair) || pair.length !== 2) throw new Error('每場比賽都需要兩個對戰位置。');
    const playerA = String(pair[0] || '').trim();
    const playerB = String(pair[1] || '').trim();
    if (!playerA || !playerB || playerA === BYE) throw new Error('每場比賽都必須指定有效選手。');
    if (playerA === playerB) throw new Error(`${playerA} 不能與自己對戰。`);
    return [playerA, playerB];
  });
  const assignedPlayers = cleanPairs.flat().filter((player) => player !== BYE);
  if (assignedPlayers.length !== activePlayers.length
    || new Set(assignedPlayers).size !== activePlayers.length
    || activePlayers.some((player) => !assignedPlayers.includes(player))) {
    throw new Error('每位已報到選手都必須剛好出現一次，不能重複或遺漏。');
  }
  const byeCount = cleanPairs.filter(([, playerB]) => playerB === BYE).length;
  const expectedByeCount = activePlayers.length % 2;
  if (byeCount !== expectedByeCount) throw new Error(expectedByeCount ? '奇數人賽程必須安排一位輪空。' : '偶數人賽程不能安排輪空。');
  return cleanPairs;
}

export function projectFutureRounds(sourceRounds) {
  // 「待定」節點只供預覽，不寫回正式賽事資料。
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

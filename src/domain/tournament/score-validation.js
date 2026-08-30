/** Formal match final-score validation. */


export function validateFinalScore(scoreA, scoreB) {
  if (![scoreA, scoreB].every((score) => Number.isInteger(score) && score >= 0)) throw new Error('比分必須是 0 以上的整數。');
  if (scoreA === scoreB) throw new Error('比分相同時無法確認勝者。');
  if (Math.max(scoreA, scoreB) < 4) throw new Error('勝方最終比分必須至少為 4 分。');
  if (Math.min(scoreA, scoreB) >= 4) throw new Error('敗方最終比分必須低於 4 分；任一方達到或超過 4 分即結束比賽。');
}

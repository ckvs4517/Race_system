/** 主控快速登分的本機模式與輸入驗證；正式賽果仍由 tournament domain / Worker 驗證。 */
export const QUICK_SCORE_MODE_KEY = 'spin-quick-score-mode';

export function readQuickScoreMode(storage = globalThis.sessionStorage) {
  try {
    return storage?.getItem?.(QUICK_SCORE_MODE_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeQuickScoreMode(enabled, storage = globalThis.sessionStorage) {
  try {
    if (enabled) storage?.setItem?.(QUICK_SCORE_MODE_KEY, '1');
    else storage?.removeItem?.(QUICK_SCORE_MODE_KEY);
  } catch {
    // 部分隱私模式可能封鎖 sessionStorage；此時只是不保留模式，不影響正式記分。
  }
  return Boolean(enabled);
}

export function validateQuickScoreInput(scoreA, scoreB) {
  const [a, b] = [scoreA, scoreB].map(parseNonNegativeInteger);
  if (a === b) throw new Error('目前比分相同，請確認裁判回報後再送出。');
  if (Math.max(a, b) < 4) throw new Error('勝方最終比分必須至少為 4 分。');
  return { scoreA: a, scoreB: b };
}

function parseNonNegativeInteger(value) {
  const text = String(value ?? '').trim();
  if (!/^\d+$/.test(text)) throw new Error('比分必須是非負整數。');
  const number = Number(text);
  if (!Number.isSafeInteger(number) || number < 0) throw new Error('比分必須是非負整數。');
  return number;
}

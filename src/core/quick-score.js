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
  if (Math.min(a, b) >= 4) throw new Error('敗方最終比分必須低於 4 分；任一方達到或超過 4 分即結束比賽。');
  return { scoreA: a, scoreB: b };
}

export function parseQuickScoreText(value) {
  const text = String(value ?? '').trim()
    .replaceAll('：', ':')
    .replace(/[－–—]/g, '-');
  let match = text.match(/^(\d+)\s*[:\/-]\s*(\d+)$/) || text.match(/^(\d+)\s+(\d+)$/);
  if (!match && /^\d{2}$/.test(text)) match = [text, text[0], text[1]];
  if (!match) throw new Error('請輸入例如 42、4:2、4 2 或 4-2 的最終比分。');
  return validateQuickScoreInput(match[1], match[2]);
}

function parseNonNegativeInteger(value) {
  const text = String(value ?? '').trim();
  if (!/^\d+$/.test(text)) throw new Error('比分必須是非負整數。');
  const number = Number(text);
  if (!Number.isSafeInteger(number) || number < 0) throw new Error('比分必須是非負整數。');
  return number;
}

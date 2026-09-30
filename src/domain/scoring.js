/** Scoring V2: browser-independent Beyblade X point events. */
export const SCORING_VERSION = 2;

export const SCORING_METHODS = Object.freeze([
  Object.freeze({ type: 'spin', label: '轉停', points: 1 }),
  Object.freeze({ type: 'over', label: '出界', points: 2 }),
  Object.freeze({ type: 'burst', label: '爆裂', points: 2 }),
  Object.freeze({ type: 'extreme', label: '極限', points: 3 }),
]);

const METHODS_BY_TYPE = new Map(SCORING_METHODS.map((method) => [method.type, method]));

export function scoringMethod(type) {
  return METHODS_BY_TYPE.get(String(type || '')) || null;
}

export function addScoringEvent(events, player, type, adjustmentPoints = null) {
  const source = Array.isArray(events) ? events : [];
  const name = String(player || '').trim();
  if (!name) throw new Error('得分事件缺少選手。');

  if (type === 'adjustment') {
    const points = Number(adjustmentPoints);
    if (!Number.isSafeInteger(points) || points === 0) throw new Error('手動調整分數必須是非 0 整數。');
    return [...source, { player: name, type: 'adjustment', points }];
  }

  const method = scoringMethod(type);
  if (!method) throw new Error('不支援的得分方式。');
  return [...source, { player: name, type: method.type, points: method.points }];
}

export function undoScoringEvent(events) {
  return Array.isArray(events) && events.length ? events.slice(0, -1) : [];
}

export function replaceScoringEvent(events, index, player, type, adjustmentPoints = null) {
  const source = Array.isArray(events) ? events : [];
  const targetIndex = Number(index);
  if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= source.length) {
    throw new Error('找不到要變更的得分紀錄。');
  }
  const [replacement] = addScoringEvent([], player, type, adjustmentPoints);
  const next = [...source];
  next[targetIndex] = replacement;
  return next;
}

export function removeScoringEvent(events, index) {
  const source = Array.isArray(events) ? events : [];
  const targetIndex = Number(index);
  if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= source.length) {
    throw new Error('找不到要撤銷的得分紀錄。');
  }
  return source.filter((_, eventIndex) => eventIndex !== targetIndex);
}

export function calculateScore(events, playerA, playerB) {
  const score = { scoreA: 0, scoreB: 0 };
  const players = new Set([String(playerA || ''), String(playerB || '')]);
  if (players.size !== 2 || players.has('')) throw new Error('得分事件需要兩位有效選手。');

  for (const event of Array.isArray(events) ? events : []) {
    validateEventShape(event, players);
    if (event.player === playerA) score.scoreA += event.points;
    else score.scoreB += event.points;
    if (score.scoreA < 0 || score.scoreB < 0) throw new Error('手動調整不能讓比分低於 0。');
  }
  return score;
}

export function validateScoringEvents(events, playerA, playerB, expectedScoreA = null, expectedScoreB = null) {
  if (!Array.isArray(events) || !events.length) throw new Error('Scoring V2 必須包含至少一筆逐局得分事件。');
  const score = calculateScore(events, playerA, playerB);
  if (expectedScoreA !== null && expectedScoreB !== null) {
    if (score.scoreA !== Number(expectedScoreA) || score.scoreB !== Number(expectedScoreB)) {
      throw new Error('逐局得分事件加總與正式比分不一致。');
    }
  }
  return score;
}

export function createAdjustmentScoringEvents(playerA, playerB, scoreA, scoreB) {
  let events = [];
  const a = Number(scoreA);
  const b = Number(scoreB);
  if (!Number.isSafeInteger(a) || a < 0 || !Number.isSafeInteger(b) || b < 0) throw new Error('比分必須是非負整數。');
  if (a) events = addScoringEvent(events, playerA, 'adjustment', a);
  if (b) events = addScoringEvent(events, playerB, 'adjustment', b);
  return events;
}

export function scoringEventLabel(event) {
  if (event?.type === 'adjustment') return '手動調整';
  return scoringMethod(event?.type)?.label || '未知得分';
}

function validateEventShape(event, players) {
  if (!event || typeof event !== 'object') throw new Error('得分事件格式無效。');
  if (!players.has(String(event.player || ''))) throw new Error('得分事件選手不在此對戰中。');
  if (!Number.isSafeInteger(event.points) || event.points === 0) throw new Error('得分事件分數必須是非 0 整數。');

  if (event.type === 'adjustment') return;
  const method = scoringMethod(event.type);
  if (!method || event.points !== method.points) throw new Error('得分事件的勝利方式與分數不一致。');
}

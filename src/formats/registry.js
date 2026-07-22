/** 賽制註冊表：新增賽制時在此登記，domain 與 UI 即可共用同一策略介面。 */
import { singleElimination } from './single-elimination.js';
import { swiss } from './swiss.js';

const formats = new Map([[singleElimination.id, singleElimination], [swiss.id, swiss]]);

export function getTournamentFormat(formatId = singleElimination.id) {
  const format = formats.get(formatId);
  if (!format) throw new Error(`不支援的賽制：${formatId}`);
  return format;
}

export function listTournamentFormats() {
  return [...formats.values()];
}

import { singleElimination } from './single-elimination.js';

const formats = new Map([[singleElimination.id, singleElimination]]);

export function getTournamentFormat(formatId = singleElimination.id) {
  const format = formats.get(formatId);
  if (!format) throw new Error(`不支援的賽制：${formatId}`);
  return format;
}

export function listTournamentFormats() {
  return [...formats.values()];
}

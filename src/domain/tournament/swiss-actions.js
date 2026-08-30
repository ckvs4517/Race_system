/** Swiss-stage and round-robin tie-break transitions delegated to format strategies. */
import { getTournamentFormat } from '../../formats/registry.js';
import { startRoundRobinTieBreak as createRoundRobinTieBreak } from '../../formats/round-robin.js';
import { normalizeTournament } from './normalization.js';

export function startSwissQualifier(tournament, candidates) {
  const normalized = normalizeTournament(tournament);
  const format = getTournamentFormat(normalized.format);
  if (format.id !== 'swiss' || !format.startQualifier) throw new Error('這場賽事不支援資格加賽。');
  return format.startQualifier(normalized, candidates);
}

export function startSwissFinal(tournament, finalists, mode = 'round_robin', rounds = 4) {
  const normalized = normalizeTournament(tournament);
  const format = getTournamentFormat(normalized.format);
  if (format.id !== 'swiss' || !format.startFinal) throw new Error('這場賽事不支援第二階段。');
  return format.startFinal(normalized, finalists, mode, rounds);
}

/** 以四輪瑞士輪積分榜直接結算，不建立額外四強賽程。 */

export function completeSwissByStandings(tournament) {
  const normalized = normalizeTournament(tournament);
  const format = getTournamentFormat(normalized.format);
  if (format.id !== 'swiss' || !format.completeByStandings) throw new Error('這場賽事不支援瑞士輪積分榜結算。');
  return format.completeByStandings(normalized);
}

export function startRoundRobinTieBreak(tournament, candidates) {
  return createRoundRobinTieBreak(normalizeTournament(tournament), candidates);
}

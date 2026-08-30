/** Tournament standings, Swiss phase standings, and bracket projection queries. */
import { getTournamentFormat } from '../../formats/registry.js';
import { normalizeTournament } from './normalization.js';
import { projectFutureRounds } from './pairings.js';

export function buildRounds(tournament) {
  const normalized = normalizeTournament(tournament);
  if (normalized.bracketVersion === 1) return normalized.rounds;
  if (normalized.format !== 'single_elimination') return structuredClone(normalized.rounds);
  return projectFutureRounds(normalized.rounds);
}

export function getTournamentStandings(tournament) {
  const normalized = normalizeTournament(tournament);
  return getTournamentFormat(normalized.format).getStandings(normalized);
}

export function getSwissPhaseStandings(tournament, phase) {
  const normalized = normalizeTournament(tournament);
  const format = getTournamentFormat(normalized.format);
  if (format.id !== 'swiss' || !format.getPhaseStandings) return [];
  return format.getPhaseStandings(normalized, phase);
}

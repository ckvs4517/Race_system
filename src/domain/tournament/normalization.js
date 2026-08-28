/** Backward-compatible tournament record normalization. */
import { getTournamentFormat } from '../../formats/registry.js';
import { DEFAULT_SWISS_RANKING_RULE, SWISS_RANKING_RULE_LEGACY, normalizeSwissRankingRule } from '../ranking/swiss-ranking.js';
import { createEmptyDrinkSettings, normalizeDrinkSettings, normalizeParticipantDetails } from '../drinks.js';
import { createTournamentRecord } from './factory.js';
import { advanceLegacyWins } from './legacy-bracket.js';
import { normalizeEventInfo, normalizeStoredArenaCount } from './metadata.js';
import { createParticipantStates, normalizeParticipantStates, rebuildDraftRoster } from './participant-model.js';
import { normalizeRegistrationSettings } from './registration-settings.js';

export function normalizeTournament(tournament) {
  // 讀取前補齊新版欄位，讓舊備份仍可在新版程式中使用。
  if (tournament.bracketVersion === 2) {
    const format = getTournamentFormat(tournament.format || 'single_elimination');
    return {
      ...tournament,
      format: format.id,
      arenaCount: normalizeStoredArenaCount(tournament.arenaCount),
      eventInfo: normalizeEventInfo(tournament.eventInfo),
      totalRounds: format.id === 'swiss' && tournament.swissVersion === 2
        ? format.totalRounds(tournament.players || [])
        : tournament.totalRounds || format.totalRounds?.(tournament.players || []) || null,
      rounds: tournament.status === '準備中' ? [] : (Array.isArray(tournament.rounds) ? tournament.rounds : []),
      participantStates: normalizeParticipantStates(tournament.players || [], tournament.participantStates),
      participantDetails: normalizeParticipantDetails(tournament.players || [], tournament.participantDetails),
      checkInVersion: 1,
      registrationSettings: normalizeRegistrationSettings(tournament.registrationSettings),
      drinkSettings: normalizeDrinkSettings(tournament.drinkSettings, createEmptyDrinkSettings()),
      ...(format.id === 'swiss' ? {
        swissRankingRule: normalizeSwissRankingRule(tournament.swissRankingRule, SWISS_RANKING_RULE_LEGACY),
      } : {}),
      ...(format.id === 'swiss' && tournament.status === '準備中' && tournament.swissVersion !== 2 ? format.initialState() : {}),
    };
  }

  const players = tournament.players || [];
  const hasRounds = Array.isArray(tournament.rounds) && tournament.rounds.length > 0;
  const hasCompletedMatch = hasRounds && tournament.rounds.some((round) => round.matches.some((match) => match.status === '已完成'));
  const isActiveLegacy = tournament.status === '已完成' || tournament.startedAt || hasCompletedMatch;
  if (isActiveLegacy) {
    return {
      ...tournament,
      format: 'single_elimination',
      arenaCount: 1,
      eventInfo: normalizeEventInfo(tournament.eventInfo),
      bracketVersion: 1,
      participantStates: normalizeParticipantStates(players, tournament.participantStates, true),
      participantDetails: normalizeParticipantDetails(players, tournament.participantDetails),
      drinkSettings: normalizeDrinkSettings(tournament.drinkSettings, createEmptyDrinkSettings()),
      checkInVersion: 1,
      status: tournament.status === '已完成' ? '已完成' : '進行中',
      rounds: hasRounds ? advanceLegacyWins(tournament.rounds) : [],
    };
  }

  const migrated = createTournamentRecord(tournament.name, players, 'single_elimination');
  return rebuildDraftRoster(
    {
      ...migrated,
      id: tournament.id,
      created: tournament.created || migrated.created,
      registrationSettings: normalizeRegistrationSettings(tournament.registrationSettings),
      participantDetails: normalizeParticipantDetails(players, tournament.participantDetails),
      drinkSettings: normalizeDrinkSettings(tournament.drinkSettings, createEmptyDrinkSettings()),
    },
    players,
    createParticipantStates(players, true),
  );
}

/** Tournament creation, draft setup, scheduling, and top-level lifecycle transitions. */
import { getTournamentFormat } from '../../formats/registry.js';
import { DEFAULT_SWISS_RANKING_RULE, SWISS_RANKING_RULE_LEGACY, normalizeSwissRankingRule } from '../ranking/swiss-ranking.js';
import { createDefaultDrinkSettings, normalizeDrinkSettings, normalizeParticipantDetails } from '../drinks.js';
import { BYE } from './constants.js';
import { createTournamentRecord } from './factory.js';
import { normalizeEventInfo, validateArenaCount } from './metadata.js';
import { normalizeTournament } from './normalization.js';
import { validateOpeningPairs } from './pairings.js';
import {
  assertSelectedDrinkOptionsRemain,
  draftCompetitionPlayers,
  normalizeParticipantStates,
  validateDraftPlayers,
  validatePlayers,
} from './participant-model.js';
import { revokeRegistrationSettings } from './registration-settings.js';
import { getTournamentStandings } from './standings.js';

export function createTournament(name, players, formatId = 'single_elimination', arenaCount = 1, eventInfo = {}, drinkSettings = createDefaultDrinkSettings()) {
  return createTournamentRecord(name, players, formatId, arenaCount, eventInfo, drinkSettings);
}

export function requiredSeedCount(tournamentOrPlayers) {
  const tournament = Array.isArray(tournamentOrPlayers)
    ? { players: tournamentOrPlayers, format: 'single_elimination' }
    : tournamentOrPlayers;
  return getTournamentFormat(tournament.format).initialSeedCount(draftCompetitionPlayers(tournament));
}

export function duplicateTournament(tournament) {
  const normalized = normalizeTournament(tournament);
  const duplicated = {
    ...createTournament(`${normalized.name}（副本）`, normalized.players, normalized.format, normalized.arenaCount, normalized.eventInfo, normalized.drinkSettings),
    participantDetails: normalizeParticipantDetails(normalized.players, normalized.participantDetails),
  };
  if (normalized.format === 'swiss' && normalized.swissStage2Config) {
    duplicated.swissStage2Config = structuredClone(normalized.swissStage2Config);
  }
  if (normalized.format === 'swiss') {
    duplicated.swissRankingRule = normalizeSwissRankingRule(normalized.swissRankingRule, SWISS_RANKING_RULE_LEGACY);
  }
  return duplicated;
}

export function updateDraftTournament(tournament, name, players, formatId = tournament.format, arenaCount = tournament.arenaCount || 1, eventInfo = tournament.eventInfo || {}, drinkSettings = tournament.drinkSettings) {
  const normalized = normalizeTournament(tournament);
  if (normalized.status !== '準備中') throw new Error('賽事開始後不能再修改參賽名單。');
  const cleanPlayers = players.map((player) => player.trim()).filter(Boolean);
  validateDraftPlayers(cleanPlayers);
  const cleanArenaCount = validateArenaCount(arenaCount);
  const format = getTournamentFormat(formatId);
  const participantStates = normalizeParticipantStates(cleanPlayers, normalized.participantStates, false);
  const participantDetails = normalizeParticipantDetails(cleanPlayers, normalized.participantDetails);
  const normalizedDrinkSettings = normalizeDrinkSettings(drinkSettings, normalized.drinkSettings);
  const swissRankingRule = format.id === 'swiss'
    ? normalized.format === 'swiss'
      ? normalizeSwissRankingRule(normalized.swissRankingRule, SWISS_RANKING_RULE_LEGACY)
      : DEFAULT_SWISS_RANKING_RULE
    : null;
  assertSelectedDrinkOptionsRemain(participantDetails, normalizedDrinkSettings);
  return {
    ...normalized,
    name: name.trim() || '未命名賽事',
    bracketVersion: 2,
    format: format.id,
    players: cleanPlayers,
    arenaCount: cleanArenaCount,
    eventInfo: normalizeEventInfo(eventInfo),
    seedPlayerIndexes: [],
    checkInVersion: 1,
    totalRounds: format.totalRounds?.(cleanPlayers) || null,
    participantStates,
    participantDetails,
    drinkSettings: normalizedDrinkSettings,
    rounds: [],
    seedDrawnAt: null,
    updatedAt: new Date().toISOString(),
    ...(format.initialState?.() || {}),
    ...(format.id === 'swiss' ? { swissRankingRule } : {}),
  };
}

export function drawRandomSeeds(tournament, random = Math.random) {
  const normalized = normalizeTournament(tournament);
  if (normalized.status !== '準備中') throw new Error('賽事開始後不能重新抽選種子。');
  const format = getTournamentFormat(normalized.format);
  const competitionPlayers = draftCompetitionPlayers(normalized);
  const seedCount = format.initialSeedCount(competitionPlayers);
  if (seedCount === 0) return normalized;

  const indexes = competitionPlayers.map((player) => normalized.players.indexOf(player));
  for (let index = indexes.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [indexes[index], indexes[swapIndex]] = [indexes[swapIndex], indexes[index]];
  }
  const seedPlayerIndexes = indexes.slice(0, seedCount);
  return {
    ...normalized,
    seedPlayerIndexes,
    rounds: [],
    seedDrawnAt: new Date().toISOString(),
  };
}

export function randomizeDraftTournament(tournament, random = Math.random) {
  const normalized = normalizeTournament(tournament);
  if (normalized.status !== '準備中') throw new Error('賽事開始後不能重新隨機分組。');
  const players = [...normalized.players];
  for (let index = players.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [players[index], players[swapIndex]] = [players[swapIndex], players[index]];
  }
  const format = getTournamentFormat(normalized.format);
  const competitionPlayers = players.filter((player) => normalized.participantStates[player]?.checkedIn);
  return {
    ...normalized,
    players,
    seedPlayerIndexes: [],
    totalRounds: format.totalRounds?.(competitionPlayers) || null,
    rounds: [],
    seedDrawnAt: null,
    randomizedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function startTournament(tournament) {
  return confirmTournamentSchedule(randomizeTournamentSchedule(prepareTournamentSchedule(tournament)));
}

export function prepareTournamentSchedule(tournament) {
  const normalized = normalizeTournament(tournament);
  const format = getTournamentFormat(normalized.format);
  if (normalized.status !== '準備中') throw new Error('這場賽事已經開始或完成。');
  const competitionPlayers = draftCompetitionPlayers(normalized);
  validatePlayers(competitionPlayers, format);
  const participantStates = Object.fromEntries(normalized.players.map((player) => [player, {
    ...normalized.participantStates[player],
    status: normalized.participantStates[player].checkedIn ? 'active' : 'no_show',
  }]));
  return {
    ...normalized,
    status: '排程中',
    participantStates,
    totalRounds: format.totalRounds?.(competitionPlayers) || normalized.totalRounds,
    seedPlayerIndexes: [],
    rounds: [],
    playerStats: {},
    registrationSettings: revokeRegistrationSettings(normalized.registrationSettings),
    schedulingStartedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function randomizeTournamentSchedule(tournament, random = Math.random) {
  const normalized = normalizeTournament(tournament);
  if (normalized.status !== '排程中') throw new Error('只有排程階段可以隨機分組。');
  const format = getTournamentFormat(normalized.format);
  const players = normalized.players.filter((player) => normalized.participantStates?.[player]?.status === 'active');
  const shuffled = [...players];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  const seedIndexes = format.id === 'single_elimination' && shuffled.length % 2 ? [0] : [];
  return {
    ...normalized,
    rounds: [format.createOpeningRound(shuffled, seedIndexes)],
    ...(format.id === 'win_streak' ? { winStreakCurrent: null, winStreakCount: 0, winStreakQueue: shuffled.slice(2) } : {}),
    scheduleRandomizedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function updateOpeningPairings(tournament, pairs) {
  const normalized = normalizeTournament(tournament);
  if (normalized.status !== '排程中') throw new Error('只有排程階段可以調整對戰。');
  if (!normalized.rounds.length) throw new Error('請先隨機分組。');
  const activePlayers = normalized.players.filter((player) => normalized.participantStates?.[player]?.status === 'active');
  const cleanPairs = validateOpeningPairs(pairs, activePlayers);
  const format = getTournamentFormat(normalized.format);
  const byePlayer = cleanPairs.find(([, playerB]) => playerB === BYE)?.[0] || null;
  const seedIndexes = format.id === 'single_elimination' && byePlayer ? [activePlayers.indexOf(byePlayer)] : [];
  const template = format.createOpeningRound(activePlayers, seedIndexes);
  const round = {
    ...template,
    seedPlayer: byePlayer,
    seedReason: byePlayer ? (format.id === 'swiss' ? 'swiss-bye' : 'manual') : null,
    matches: cleanPairs.map(([playerA, playerB], index) => ({
      ...template.matches[index],
      id: template.matches[index]?.id || `r1m${index + 1}`,
      playerA,
      playerB,
      scoreA: null,
      scoreB: null,
      winner: playerB === BYE ? playerA : null,
      status: playerB === BYE ? '輪空晉級' : '可開始',
    })),
  };
  return {
    ...normalized,
    rounds: [round],
    scheduleAdjustedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function confirmTournamentSchedule(tournament) {
  const normalized = normalizeTournament(tournament);
  if (normalized.status !== '排程中') throw new Error('目前不是可確認賽程的階段。');
  const activePlayers = normalized.players.filter((player) => normalized.participantStates?.[player]?.status === 'active');
  const format = getTournamentFormat(normalized.format);
  // 奇數人循環賽以休息輪表示輪空，不建立假的「選手對輪空」節點。
  if (format.supportsOpeningPairingEdit !== false) validateOpeningPairs(normalized.rounds[0]?.matches?.map((match) => [match.playerA, match.playerB]) || [], activePlayers);
  const openingRound = structuredClone(normalized.rounds[0]);
  const stats = format.initializeStats(normalized.players);
  return {
    ...normalized,
    status: '進行中',
    rounds: [openingRound],
    playerStats: format.activateOpeningRound(openingRound, stats),
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function completeTournamentEarlyLegacy(tournament) {
  const normalized = normalizeTournament(tournament);
  if (normalized.status !== '?脰?銝?') throw new Error('目前沒有進行中的賽事可提前結束。');
  const standings = getTournamentStandings(normalized);
  const leader = standings[0];
  const tied = standings.filter((row) => row.rank === 1).length > 1;
  return {
    ...normalized,
    status: '撌脣???',
    champion: tied ? null : leader?.player || null,
    endedEarly: true,
    endedEarlyAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/** 建立並列名次者的循環加賽；加賽結果只用於決定該組最終名次。 */

export function completeTournamentEarly(tournament) {
  const normalized = normalizeTournament(tournament);
  if (normalized.status !== '進行中') throw new Error('目前沒有進行中的賽事可提前結束。');
  const standings = getTournamentStandings(normalized);
  const tied = standings.filter((row) => row.rank === 1).length > 1;
  return { ...normalized, status: '已完成', champion: tied ? null : standings[0]?.player || null, endedEarly: true, endedEarlyAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
}

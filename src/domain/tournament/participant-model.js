/** Participant roster invariants and draft-roster reconstruction. */
import { getTournamentFormat } from '../../formats/registry.js';
import { normalizeParticipantDetails, normalizePhone, resolveDrinkSelection } from '../drinks.js';
import { MAX_TOURNAMENT_PLAYERS } from './constants.js';

export function validatePlayers(players, format = null) {
  const minimum = format?.minPlayers || 2;
  const maximum = format?.maxPlayers || MAX_TOURNAMENT_PLAYERS;
  if (players.length < minimum || players.length > maximum) throw new Error(`${format?.name || '此賽制'}參賽者人數需要介於 ${minimum} 至 ${maximum} 位。`);
  if (new Set(players).size !== players.length) throw new Error('參賽者名稱不可重複。');
}

export function validateDraftPlayers(players) {
  if (players.length > MAX_TOURNAMENT_PLAYERS) throw new Error(`參賽者人數不可超過 ${MAX_TOURNAMENT_PLAYERS} 位。`);
  if (new Set(players).size !== players.length) throw new Error('參賽者名稱不可重複。');
}

export function assertDraftRosterChange(tournament) {
  if (tournament.status !== '準備中') throw new Error('賽事開始後不能再修改報到名單。');
}

export function draftCompetitionPlayers(tournament) {
  if (tournament.status !== '準備中' || tournament.checkInVersion !== 1) return tournament.players || [];
  return (tournament.players || []).filter((player) => tournament.participantStates?.[player]?.checkedIn);
}

export function rebuildDraftRoster(tournament, players, participantStates, participantDetails = tournament.participantDetails) {
  validateDraftPlayers(players);
  const format = getTournamentFormat(tournament.format);
  const normalizedStates = normalizeParticipantStates(players, participantStates, false);
  const competitionPlayers = players.filter((player) => normalizedStates[player].checkedIn);
  return {
    ...tournament,
    players,
    checkInVersion: 1,
    participantStates: normalizedStates,
    participantDetails: normalizeParticipantDetails(players, participantDetails),
    seedPlayerIndexes: [],
    seedDrawnAt: null,
    totalRounds: format.totalRounds?.(competitionPlayers) || null,
    rounds: [],
    updatedAt: new Date().toISOString(),
    ...(format.initialState?.() || {}),
  };
}

export function normalizeDraftParticipantDetail(tournament, player, value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  const existing = tournament.participantDetails?.[player] || {};
  const hasDrinkUpdate = Object.prototype.hasOwnProperty.call(source, 'drink');
  return {
    phone: String(source.phone ?? existing.phone ?? '').trim().slice(0, 40),
    notes: String(source.notes ?? existing.notes ?? '').trim().slice(0, 500),
    answers: source.answers && typeof source.answers === 'object' ? structuredClone(source.answers) : structuredClone(existing.answers || {}),
    drink: hasDrinkUpdate
      ? (source.drink ? resolveDrinkSelection(tournament.drinkSettings, source.drink, { allowMissing: true }) : null)
      : (existing.drink || null),
  };
}

export function assertUniqueParticipantPhone(players, participantDetails) {
  const seen = new Set();
  for (const player of players) {
    const phone = normalizePhone(participantDetails?.[player]?.phone);
    if (!phone) continue;
    if (seen.has(phone)) throw new Error('這支聯絡電話已經在正式名單中。');
    seen.add(phone);
  }
}

export function assertSelectedDrinkOptionsRemain(participantDetails, settings) {
  for (const details of Object.values(participantDetails || {})) {
    const drink = details?.drink;
    if (!drink || drink.category === 'legacy') continue;
    if (!settings.items.some((item) => item.id === drink.itemId || item.name === drink.displayName)) {
      throw new Error(`飲品「${drink.displayName}」已有選手選擇，不能刪除；可以改為停用。`);
    }
  }
}

export function createParticipantStates(players, checkedIn = true) {
  return Object.fromEntries(players.map((player) => [player, { status: 'active', checkedIn }]));
}

export function normalizeParticipantStates(players, states = {}, defaultCheckedIn = true) {
  return Object.fromEntries(players.map((player) => [player, {
    ...(states?.[player] || {}),
    status: ['active', 'withdrawn', 'no_show'].includes(states?.[player]?.status) ? states[player].status : 'active',
    checkedIn: typeof states?.[player]?.checkedIn === 'boolean' ? states[player].checkedIn : defaultCheckedIn,
  }]));
}

/** Draft roster and check-in operations. */
import { normalizeTournament } from './normalization.js';
import {
  assertDraftRosterChange,
  assertUniqueParticipantPhone,
  normalizeDraftParticipantDetail,
  rebuildDraftRoster,
  validateDraftPlayers,
} from './participant-model.js';

export function setDraftPlayerCheckedIn(tournament, player, checkedIn) {
  const normalized = normalizeTournament(tournament);
  assertDraftRosterChange(normalized);
  if (!normalized.players.includes(player)) throw new Error('找不到這位參賽者。');
  const participantStates = {
    ...normalized.participantStates,
    [player]: { ...normalized.participantStates[player], status: 'active', checkedIn: Boolean(checkedIn) },
  };
  return rebuildDraftRoster(normalized, normalized.players, participantStates);
}

export function setAllDraftPlayersCheckedIn(tournament) {
  const normalized = normalizeTournament(tournament);
  assertDraftRosterChange(normalized);
  const participantStates = Object.fromEntries(normalized.players.map((player) => [
    player,
    { ...normalized.participantStates[player], status: 'active', checkedIn: true },
  ]));
  return rebuildDraftRoster(normalized, normalized.players, participantStates);
}

export function addDraftPlayer(tournament, player, details = {}) {
  const normalized = normalizeTournament(tournament);
  assertDraftRosterChange(normalized);
  const name = String(player || '').trim();
  if (!name) throw new Error('請輸入選手名稱。');
  const players = [...normalized.players, name];
  validateDraftPlayers(players);
  const participantStates = {
    ...normalized.participantStates,
    [name]: { status: 'active', checkedIn: false },
  };
  const participantDetails = {
    ...normalized.participantDetails,
    [name]: normalizeDraftParticipantDetail(normalized, name, details),
  };
  assertUniqueParticipantPhone(players, participantDetails);
  return rebuildDraftRoster(normalized, players, participantStates, participantDetails);
}

export function removeDraftPlayer(tournament, player) {
  const normalized = normalizeTournament(tournament);
  assertDraftRosterChange(normalized);
  if (!normalized.players.includes(player)) throw new Error('找不到這位參賽者。');
  const players = normalized.players.filter((candidate) => candidate !== player);
  const participantStates = { ...normalized.participantStates };
  const participantDetails = { ...normalized.participantDetails };
  delete participantStates[player];
  delete participantDetails[player];
  return rebuildDraftRoster(normalized, players, participantStates, participantDetails);
}

export function updateDraftParticipant(tournament, player, nextName, details = {}) {
  const normalized = normalizeTournament(tournament);
  assertDraftRosterChange(normalized);
  if (!normalized.players.includes(player)) throw new Error('找不到這位參賽者。');
  const name = String(nextName || '').trim();
  if (!name) throw new Error('請輸入選手名稱。');
  const players = normalized.players.map((candidate) => candidate === player ? name : candidate);
  validateDraftPlayers(players);
  const participantStates = { ...normalized.participantStates };
  const previousState = participantStates[player];
  delete participantStates[player];
  participantStates[name] = previousState;
  const participantDetails = { ...normalized.participantDetails };
  const previousDetails = participantDetails[player] || {};
  delete participantDetails[player];
  participantDetails[name] = normalizeDraftParticipantDetail(
    { ...normalized, participantDetails: { ...normalized.participantDetails, [name]: previousDetails } },
    name,
    details,
  );
  assertUniqueParticipantPhone(players, participantDetails);
  return rebuildDraftRoster(normalized, players, participantStates, participantDetails);
}

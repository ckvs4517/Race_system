/** Registration-to-roster confirmation and registration settings actions. */
import { normalizePhone, resolveDrinkSelection } from '../drinks.js';
import { normalizeTournament } from './normalization.js';
import { assertDraftRosterChange, assertUniqueParticipantPhone, rebuildDraftRoster, validateDraftPlayers } from './participant-model.js';
import { normalizeRegistrationSettings, revokeRegistrationSettings } from './registration-settings.js';

export function addConfirmedParticipant(tournament, registration) {
  const normalized = normalizeTournament(tournament);
  assertDraftRosterChange(normalized);
  const name = String(registration?.displayName || '').trim();
  if (!name) throw new Error('請輸入選手名稱。');
  if (normalized.players.includes(name)) throw new Error('這個選手名稱已經在正式名單中。');
  if (normalized.players.length >= normalized.registrationSettings.capacity) throw new Error('這場賽事的名額已滿。');
  const phone = String(registration?.phone || '').trim();
  if (!normalizePhone(phone)) throw new Error('請輸入聯絡電話。');
  const drink = resolveDrinkSelection(normalized.drinkSettings, registration?.drink, { allowMissing: true });
  const players = [...normalized.players, name];
  validateDraftPlayers(players);
  const participantStates = {
    ...normalized.participantStates,
    [name]: { status: 'active', checkedIn: false },
  };
  const participantDetails = {
    ...normalized.participantDetails,
    [name]: {
      phone,
      notes: String(registration?.notes || '').trim().slice(0, 500),
      answers: registration?.answers && typeof registration.answers === 'object' ? structuredClone(registration.answers) : {},
      drink,
    },
  };
  assertUniqueParticipantPhone(players, participantDetails);
  return rebuildDraftRoster(normalized, players, participantStates, participantDetails);
}

export function updateRegistrationSettings(tournament, settings) {
  const normalized = normalizeTournament(tournament);
  if (normalized.status !== '準備中') throw new Error('賽事開始後不能修改報名設定。');
  const nextSettings = normalizeRegistrationSettings({ ...normalized.registrationSettings, ...settings });
  return {
    ...normalized,
    registrationSettings: normalized.registrationSettings.enabled && !nextSettings.enabled
      ? revokeRegistrationSettings(nextSettings)
      : nextSettings,
    updatedAt: new Date().toISOString(),
  };
}

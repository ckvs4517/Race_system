/** Server-side validation for persisted tournament payloads. */
import { MAX_TOURNAMENT_PLAYERS } from '../tournament-domain.js';

export function validateTournament(value) {
  if (!value || typeof value !== 'object') throw new Error('Invalid tournament');
  if (!Number.isFinite(Number(value.id))) throw new Error('Invalid tournament id');
  if (typeof value.name !== 'string' || value.name.length < 1 || value.name.length > 80) throw new Error('Invalid tournament name');
  if (!Array.isArray(value.players) || value.players.length > MAX_TOURNAMENT_PLAYERS || (value.status !== '準備中' && value.players.length < 2)) throw new Error('Invalid players');
  if (value.eventInfo != null) {
    if (typeof value.eventInfo !== 'object' || Array.isArray(value.eventInfo)) throw new Error('Invalid event info');
    const limits = { date: 10, checkInStart: 5, checkInEnd: 5, startTime: 5, venueName: 80, address: 160, mapUrl: 500, postUrl: 500, notes: 2000 };
    for (const [key, limit] of Object.entries(limits)) {
      if (value.eventInfo[key] != null && (typeof value.eventInfo[key] !== 'string' || value.eventInfo[key].length > limit)) throw new Error(`Invalid event info: ${key}`);
    }
  }
  if (value.registrationSettings != null) {
    const settings = value.registrationSettings;
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw new Error('Invalid registration settings');
    if (typeof settings.token !== 'string' || settings.token.length < 16 || settings.token.length > 100) throw new Error('Invalid registration token');
    if (!Number.isInteger(Number(settings.capacity)) || Number(settings.capacity) < 2 || Number(settings.capacity) > MAX_TOURNAMENT_PLAYERS) throw new Error('Invalid registration capacity');
    if (typeof settings.deadline !== 'string' || settings.deadline.length > 30) throw new Error('Invalid registration deadline');
    if (!Array.isArray(settings.fields) || settings.fields.length > 20) throw new Error('Invalid registration fields');
  }
  if (value.drinkSettings != null) validateDrinkSettings(value.drinkSettings);
  if (value.participantDetails != null && (!value.participantDetails || typeof value.participantDetails !== 'object' || Array.isArray(value.participantDetails))) {
    throw new Error('Invalid participant details');
  }
  return value;
}

function validateDrinkSettings(settings) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw new Error('Invalid drink settings');
  if (typeof settings.enabled !== 'boolean') throw new Error('Invalid drink settings');
  if (!Array.isArray(settings.items) || settings.items.length > 50) throw new Error('Invalid drink settings');
  if (settings.items.some((item) => !item || typeof item !== 'object' || typeof item.id !== 'string' || item.id.length > 60 || typeof item.name !== 'string' || item.name.length > 100 || typeof item.active !== 'boolean')) throw new Error('Invalid drink settings');
  if (String(settings.notice || '').length > 500 || String(settings.changeNotice || '').length > 500) throw new Error('Invalid drink settings');
}

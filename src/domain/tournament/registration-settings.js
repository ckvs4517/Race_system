/** Public registration settings and token lifecycle. */
import { MAX_TOURNAMENT_PLAYERS } from './constants.js';

export function createRegistrationSettings() {
  return {
    enabled: false,
    token: createPublicToken(),
    capacity: MAX_TOURNAMENT_PLAYERS,
    deadline: '',
    fields: [],
  };
}

export function revokeRegistrationSettings(settings = {}) {
  return {
    ...normalizeRegistrationSettings(settings),
    enabled: false,
    token: createPublicToken(),
  };
}

export function normalizeRegistrationSettings(value = {}) {
  const settings = value && typeof value === 'object' ? value : {};
  const capacity = Number(settings.capacity);
  const fields = Array.isArray(settings.fields) ? settings.fields
    .filter((field) => field && typeof field === 'object' && typeof field.id === 'string' && typeof field.label === 'string')
    .slice(0, 20)
    .map((field) => ({
      id: field.id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40),
      label: field.label.slice(0, 80),
      type: ['text', 'textarea', 'checkbox'].includes(field.type) ? field.type : 'text',
      required: Boolean(field.required),
    }))
    .filter((field) => field.id && field.label) : [];
  return {
    enabled: Boolean(settings.enabled),
    token: typeof settings.token === 'string' && settings.token.length >= 16 ? settings.token : createPublicToken(),
    capacity: Number.isInteger(capacity) && capacity >= 2 && capacity <= MAX_TOURNAMENT_PLAYERS ? capacity : MAX_TOURNAMENT_PLAYERS,
    deadline: typeof settings.deadline === 'string' ? settings.deadline.slice(0, 30) : '',
    fields,
  };
}

function createPublicToken() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID().replaceAll('-', '');
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
}

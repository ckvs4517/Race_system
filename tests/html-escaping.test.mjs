/** User-controlled tournament/registration text must stay escaped in HTML string views. */
import assert from 'node:assert/strict';
import { tournamentListView } from '../src/views/schedule/tournament-list.js';
import { registrationView } from '../src/views/registration.js';
import { registrationAdminView } from '../src/views/registration-admin.js';

globalThis.location = new URL('https://example.com/');

const attack = '<img src=x onerror="globalThis.__xss=1">';
const script = '<script>globalThis.__xss=1</script>';
const tournament = {
  id: 77,
  name: attack,
  status: '準備中',
  format: 'single_elimination',
  arenaCount: 1,
  players: [script],
  participantDetails: {
    [script]: { phone: attack, drink: { displayName: script } },
  },
  participantStates: { [script]: { status: 'active', checkedIn: false } },
  registrationSettings: { enabled: true, token: 'private-token', capacity: 8, fields: [] },
  drinkSettings: { enabled: false, items: [] },
  eventInfo: { date: '2026-08-30', venueName: script },
  rounds: [],
};

const listHtml = tournamentListView([tournament], true);
assert.doesNotMatch(listHtml, /<img src=x onerror=/, 'tournament list escapes tournament names in text/attributes');
assert.doesNotMatch(listHtml, /<script>globalThis\.__xss/, 'tournament list escapes venue text');
assert.match(listHtml, /&lt;img src=x onerror=/, 'escaped tournament name remains visible as text');

const publicRegistrationHtml = registrationView({
  data: {
    tournament: {
      id: 77,
      name: attack,
      capacity: 8,
      fields: [{ id: 'field-1', label: script, type: 'text', required: true }],
      drinkSettings: { enabled: false, items: [] },
    },
    registrationCount: 0,
  },
});
assert.doesNotMatch(publicRegistrationHtml, /<img src=x onerror=/, 'registration page escapes tournament name');
assert.doesNotMatch(publicRegistrationHtml, /<script>globalThis\.__xss/, 'registration page escapes custom field labels');

const adminHtml = registrationAdminView([tournament], 77, [], false);
assert.doesNotMatch(adminHtml, /<img src=x onerror=/, 'registration admin escapes participant phone and tournament text');
assert.doesNotMatch(adminHtml, /<script>globalThis\.__xss/, 'registration admin escapes participant name and drink text');

console.log('PASS HTML escaping boundaries');

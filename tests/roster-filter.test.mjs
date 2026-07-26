import assert from 'node:assert/strict';
import { rosterPlayerMatches } from '../src/core/roster-filter.js';

assert.equal(rosterPlayerMatches('綠寶石水花', false, 'all', ''), true);
assert.equal(rosterPlayerMatches('綠寶石水花', false, 'unchecked', ''), true);
assert.equal(rosterPlayerMatches('HowHow', true, 'unchecked', ''), false);
assert.equal(rosterPlayerMatches('HowHow', true, 'checked', ''), true);
assert.equal(rosterPlayerMatches('綠寶石水花', false, 'unchecked', '綠寶石'), true);
assert.equal(rosterPlayerMatches('狂暴格里芬', false, 'unchecked', '綠寶石'), false);
assert.equal(rosterPlayerMatches('綠寶石水花', false, 'checked', '綠寶石'), false);
assert.equal(rosterPlayerMatches('HowHow', true, 'all', 'how'), true);

console.log('PASS roster filter intersection');

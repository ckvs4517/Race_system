/** V2 架構回歸：main.js 只做 app coordination，不再承載各 feature 的 controller 細節。 */
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

const mainUrl = new URL('../src/main.js', import.meta.url);
const mainSource = await readFile(mainUrl, 'utf8');
const mainStat = await stat(mainUrl);

assert.ok(mainStat.size < 16_000, `V2 main.js should stay coordinator-sized; current size is ${mainStat.size} bytes`);
assert.match(mainSource, /features\/schedule\/controller\.js/, 'main wires the schedule feature controller');
assert.match(mainSource, /features\/registration\/controller\.js/, 'main wires the registration feature controller');
assert.match(mainSource, /features\/tournament-management\/controller\.js/, 'main wires tournament management controller');
assert.match(mainSource, /features\/data-management\/controller\.js/, 'main wires data management controller');
assert.match(mainSource, /features\/control\/controller\.js/, 'main wires control controller');

for (const forbidden of [
  'function bindScheduleEvents',
  'function bindRegistrationAdminEvents',
  'function bindManageEvents',
  'function bindDataManagementEvents',
  'executeTournamentAction(',
  'createTournamentRecord(',
  'deleteTournamentRecord(',
]) {
  assert.ok(!mainSource.includes(forbidden), `main.js must not regain feature implementation: ${forbidden}`);
}

console.log(`PASS V2 main boundary (${mainStat.size} bytes)`);

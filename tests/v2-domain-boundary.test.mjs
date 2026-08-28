/** V2 Phase 3: tournament.js remains a stable thin facade over coherent domain modules. */
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const facadeUrl = new URL('../src/domain/tournament.js', import.meta.url);
const facadeSource = await readFile(facadeUrl, 'utf8');
const facadeInfo = await stat(facadeUrl);
assert.ok(facadeInfo.size < 1_000, `tournament.js should stay a thin facade; current size is ${facadeInfo.size} bytes`);
assert.match(facadeSource, /tournament\/index\.js/, 'compatibility facade must point at the V2 tournament index');
assert.ok(!/\bfunction\b/.test(facadeSource), 'compatibility facade must not regain tournament implementation details');

const expected = [
  'MAX_TOURNAMENT_PLAYERS', 'nextPowerOfTwo', 'requiredSeedCount', 'createTournament', 'duplicateTournament',
  'updateDraftTournament', 'setDraftPlayerCheckedIn', 'setAllDraftPlayersCheckedIn', 'addDraftPlayer', 'removeDraftPlayer',
  'updateDraftParticipant', 'addConfirmedParticipant', 'drawRandomSeeds', 'randomizeDraftTournament', 'startTournament',
  'prepareTournamentSchedule', 'randomizeTournamentSchedule', 'updateOpeningPairings', 'confirmTournamentSchedule',
  'normalizeTournament', 'buildRounds', 'getTournamentStandings', 'getSwissPhaseStandings', 'startSwissQualifier',
  'startSwissFinal', 'completeSwissByStandings', 'startRoundRobinTieBreak', 'completeTournamentEarly',
  'updateRegistrationSettings', 'resetCompletedMatch', 'recordMatchResult', 'forfeitMatch', 'withdrawPlayer',
].sort();
const facade = await import('../src/domain/tournament.js');
const index = await import('../src/domain/tournament/index.js');
assert.deepEqual(Object.keys(facade).sort(), expected, 'legacy tournament.js public exports must remain stable');
assert.deepEqual(Object.keys(index).sort(), expected, 'V2 tournament index must expose the same supported API');

const modulesDir = new URL('../src/domain/tournament/', import.meta.url);
const modules = (await readdir(modulesDir)).filter((name) => name.endsWith('.js'));
assert.ok(modules.length >= 10, 'Phase 3 should split the tournament domain into coherent modules');
for (const name of modules) {
  const info = await stat(new URL(name, modulesDir));
  assert.ok(info.size < 18_000, `${name} must not become a replacement tournament monolith (${info.size} bytes)`);
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(child));
    else if (/\.m?js$/.test(entry.name)) files.push(child);
  }
  return files;
}
const appFiles = [...await walk('src'), ...await walk('worker')]
  .filter((file) => !file.startsWith(path.join('src', 'domain', 'tournament')));
for (const file of appFiles) {
  const source = await readFile(file, 'utf8');
  assert.ok(!source.includes('/domain/tournament/'), `${file} must use the stable tournament facade instead of domain internals`);
}

console.log(`PASS V2 tournament domain boundary (${modules.length} modules)`);

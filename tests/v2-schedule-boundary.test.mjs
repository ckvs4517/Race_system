/** V2 Phase 2：schedule.js 必須維持薄 façade，畫面責任留在 schedule 子模組。 */
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

const facadePath = new URL('../src/views/schedule.js', import.meta.url);
const facade = await readFile(facadePath, 'utf8');
const facadeInfo = await stat(facadePath);
assert.ok(facadeInfo.size < 2_000, `schedule.js 應維持薄 façade，目前 ${facadeInfo.size} bytes`);
assert.match(facade, /schedule\/tournament-list\.js/, '列表畫面由獨立模組負責');
assert.match(facade, /schedule\/tournament-detail\.js/, '賽事詳情由獨立模組負責');
for (const forbidden of ['bracketView', 'matchCard', 'leaderboardView', 'draftCheckInView', 'swissDecisionPanel']) {
  assert.ok(!facade.includes(`function ${forbidden}`), `${forbidden} 不應回流 schedule.js façade`);
}

const modules = [
  'tournament-list.js', 'tournament-detail.js', 'participant-panels.js',
  'decision-panels.js', 'leaderboard.js', 'rounds.js', 'event-date.js', 'html-escape.js',
];
for (const name of modules) {
  const info = await stat(new URL(`../src/views/schedule/${name}`, import.meta.url));
  assert.ok(info.size < 20_000, `${name} 不應成為新的 schedule monolith (${info.size} bytes)`);
}

console.log('PASS V2 schedule view boundary');

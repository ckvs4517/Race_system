/** V2 Phase 5: app.css stays a thin ordered style manifest. */
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

const appUrl = new URL('../src/styles/app.css', import.meta.url);
const source = await readFile(appUrl, 'utf8');
const info = await stat(appUrl);
assert.ok(info.size < 2_000, `app.css should stay a thin style manifest; current size is ${info.size} bytes`);
assert.ok(!source.includes('{'), 'app.css must not regain concrete style rules');

const expected = [
  './base/foundation.css',
  './features/scoreboard.css',
  './features/tournament-management.css',
  './features/schedule.css',
  './base/footer.css',
  './responsive/global.css',
  './features/quick-score.css',
  './features/guide.css',
  './features/share-card.css',
  './features/speedometer.css',
  './features/registration.css',
  './features/schedule-responsive.css',
];
const imports = [...source.matchAll(/@import\s+url\(['"]([^'"]+)['"]\);/g)].map((match) => match[1]);
assert.deepEqual(imports, expected, 'Phase 5 stylesheet import order is part of the visual compatibility contract');

for (const relative of imports) {
  const fileUrl = new URL(`../src/styles/${relative.slice(2)}`, import.meta.url);
  const moduleSource = await readFile(fileUrl, 'utf8');
  const moduleInfo = await stat(fileUrl);
  assert.ok(moduleSource.trim().length > 0, `${relative} must not be empty`);
  assert.ok(!moduleSource.includes('@import'), `${relative} must not create nested style import chains`);
  assert.ok(moduleInfo.size < 35_000, `${relative} is too large for a Phase 5 responsibility module (${moduleInfo.size} bytes)`);
}

console.log(`PASS V2 CSS boundary (${imports.length} ordered style modules)`);

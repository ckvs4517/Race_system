/** V2 Phase 4: Worker entry stays thin and D1 access stays in persistence adapters. */
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';

const entry = await readFile('worker/index.js', 'utf8');
assert.ok((await stat('worker/index.js')).size < 2_000, 'worker/index.js must stay a thin entry point');
assert.match(entry, /handleApiRequest/, 'Worker entry delegates API routing');
assert.doesNotMatch(entry, /\.prepare\s*\(/, 'Worker entry must not access D1 directly');

const routeFiles = (await readdir('worker/routes')).filter((name) => name.endsWith('.js'));
const serviceFiles = (await readdir('worker/services')).filter((name) => name.endsWith('.js'));
const dbFiles = (await readdir('worker/db')).filter((name) => name.endsWith('.js'));
assert.ok(routeFiles.length >= 3, 'Phase 4 has dedicated route modules');
assert.ok(serviceFiles.length >= 4, 'Phase 4 has dedicated server service modules');
assert.ok(dbFiles.length >= 2, 'Phase 4 has dedicated D1 adapters');

for (const file of [...routeFiles.map((name) => `worker/routes/${name}`), ...serviceFiles.map((name) => `worker/services/${name}`)]) {
  const source = await readFile(file, 'utf8');
  assert.doesNotMatch(source, /\.prepare\s*\(/, `${file} must not contain D1 SQL preparation`);
}
for (const file of dbFiles.map((name) => `worker/db/${name}`)) {
  const info = await stat(file);
  assert.ok(info.size < 10_000, `${file} must stay a narrow persistence adapter`);
}

console.log(`PASS V2 Worker boundary (${routeFiles.length} routes, ${serviceFiles.length} services, ${dbFiles.length} db adapters)`);

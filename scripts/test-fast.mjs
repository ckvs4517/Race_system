import { runCommand } from './lib/test-runner.mjs';

const tests = [
  'tests/v2-main-boundary.test.mjs',
  'tests/v2-schedule-boundary.test.mjs',
  'tests/v2-domain-boundary.test.mjs',
  'tests/v2-worker-boundary.test.mjs',
  'tests/v2-css-boundary.test.mjs',
  'tests/source-version.test.mjs',
  'tests/staging-target.test.mjs',
  'tests/roster-filter.test.mjs',
  'tests/check-in.test.mjs',
  'tests/quick-score.test.mjs',
  'tests/swiss.test.mjs',
  'tests/swiss-ranking.test.mjs',
  'tests/stage2-rounds-visibility.test.mjs',
  'tests/tournament-capacity.test.mjs',
  'tests/tournament-list.test.mjs',
  'tests/early-finish-lock.test.mjs',
  'tests/data-management.test.mjs',
  'tests/registration.test.mjs',
  'tests/admin-privacy-transition.test.mjs',
  'tests/api.test.mjs',
  'tests/sync.test.mjs',
  'tests/action-sync.test.mjs',
  'tests/responsive-ui.test.mjs',
  'tests/share-card.test.mjs',
  'tests/small-formats.test.mjs',
  'tests/battle-pass.test.mjs',
  'tests/screen-wake-lock.test.mjs',
  'tests/speed-report.test.mjs',
];

const startedAt = Date.now();
for (const test of tests) {
  const result = await runCommand(test, process.execPath, [test]);
  if (result.stdout.trim()) console.log(result.stdout.trim());
}
console.log(`SUMMARY fast tests: ${tests.length} passed in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);

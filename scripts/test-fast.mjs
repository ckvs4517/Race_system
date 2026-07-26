/** 常用快速回歸：成功時只輸出摘要，失敗時才顯示該測試完整輸出。 */
import { runCommand } from './lib/test-runner.mjs';

const tests = [
  'tests/roster-filter.test.mjs',
  'tests/check-in.test.mjs',
  'tests/swiss.test.mjs',
  'tests/data-management.test.mjs',
  'tests/registration.test.mjs',
  'tests/api.test.mjs',
  'tests/sync.test.mjs',
  'tests/action-sync.test.mjs',
  'tests/responsive-ui.test.mjs',
];

const started = Date.now();
for (const test of tests) await runCommand(test, process.execPath, [test]);
console.log(`SUMMARY fast tests: ${tests.length} passed in ${((Date.now() - started) / 1000).toFixed(1)}s`);

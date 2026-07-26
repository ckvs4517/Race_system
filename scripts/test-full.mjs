/** 完整本機驗證：所有 Node 測試、選配瀏覽器流程、Sites 建置。 */
import { join } from 'node:path';
import {
  discoverNodeTests,
  findChrome,
  projectRoot,
  runCommand,
  spawnBackground,
  waitForUrl,
} from './lib/test-runner.mjs';

const browserMode = argumentValue('--browser') || 'skip';
const skipBuild = process.argv.includes('--skip-build');
if (!['auto', 'required', 'skip'].includes(browserMode)) {
  throw new Error('--browser must be auto, required, or skip');
}

const started = Date.now();
let passed = 0;
let skipped = 0;
const nodeTests = await discoverNodeTests();
for (const test of nodeTests) {
  await runCommand(test, process.execPath, [test]);
  passed += 1;
}

if (browserMode === 'skip') {
  console.log('SKIP browser flows (--browser=skip)');
  skipped += 2;
} else {
  const chrome = await findChrome();
  if (!chrome) {
    if (browserMode === 'required') throw new Error('Chrome/Chromium was required but was not found. Set CHROME_PATH.');
    console.log('SKIP browser flows (Chrome/Chromium not found)');
    skipped += 2;
  } else {
    const port = 18765;
    const server = spawnBackground(process.execPath, ['tests/local-test-server.mjs'], {
      env: { TEST_PORT: String(port) },
    });
    let serverError = '';
    server.stderr.on('data', (chunk) => { serverError += chunk; });
    try {
      await waitForUrl(`http://127.0.0.1:${port}/index.html`);
      for (const page of ['tournament.test.html', 'full-flow.test.html']) {
        const label = `browser ${page}`;
        const result = await runCommand(label, chrome, [
          '--headless=new',
          '--no-sandbox',
          '--disable-gpu',
          '--virtual-time-budget=20000',
          '--dump-dom',
          `http://127.0.0.1:${port}/tests/${page}`,
        ], { timeoutMs: 35_000 });
        if (!result.stdout.includes('PASS ')) throw new Error(`${label} did not contain a PASS marker.`);
        passed += 1;
      }
    } finally {
      server.kill('SIGTERM');
      if (serverError.trim()) console.error(serverError.trimEnd());
    }
  }
}

if (skipBuild) {
  console.log('SKIP Sites build (--skip-build)');
  skipped += 1;
} else {
  await runCommand('Sites build', process.execPath, ['scripts/build-site.mjs']);
  passed += 1;
}

console.log(`SUMMARY full tests: ${passed} passed, ${skipped} skipped in ${((Date.now() - started) / 1000).toFixed(1)}s`);

function argumentValue(name) {
  const inline = process.argv.find((value) => value.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

/** Staging destructive E2E 的網域、命名、runner 與 workflow 防呆。 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import {
  E2E_NAME_PREFIX,
  STAGING_HOSTNAME,
  assertE2ETournamentName,
  createE2ETournamentName,
  normalizeStagingUrl,
} from '../scripts/lib/staging-target.mjs';

const staging = normalizeStagingUrl(`https://${STAGING_HOSTNAME}/#home`);
assert.equal(staging.origin, `https://${STAGING_HOSTNAME}`);
assert.equal(staging.pathname, '/');
assert.equal(staging.hash, '');

for (const target of [
  'http://spin-league-test.ckvs4517.chatgpt.site/',
  'https://spin-league-tournament.ckvs4517.chatgpt.site/',
  'https://example.com/',
]) {
  assert.throws(() => normalizeStagingUrl(target), /拒絕|HTTPS/, `必須拒絕非 staging 目標：${target}`);
}

const name = createE2ETournamentName(1_700_000_000_000, 0.25);
assert.ok(name.startsWith(E2E_NAME_PREFIX));
assert.equal(assertE2ETournamentName(name), name);
assert.throws(() => assertE2ETournamentName('一般測試賽'), /拒絕刪除非/);

const syntax = spawnSync(process.execPath, ['--check', 'scripts/verify-staging-e2e.mjs'], { encoding: 'utf8' });
assert.equal(syntax.status, 0, `staging E2E runner 語法錯誤：${syntax.stderr || syntax.stdout}`);

const workflow = await readFile(new URL('../.github/workflows/staging-e2e.yml', import.meta.url), 'utf8');
assert.match(workflow, /STAGING_SITE_URL: https:\/\/spin-league-test\.ckvs4517\.chatgpt\.site\//, 'workflow 固定指向測試站');
assert.match(workflow, /STAGING_ADMIN_PIN: \$\{\{ secrets\.STAGING_ADMIN_PIN \}\}/, 'PIN 只能從 GitHub Actions secret 讀取');
assert.doesNotMatch(workflow, /spin-league-tournament\.ckvs4517\.chatgpt\.site/, 'workflow 不得包含正式站目標');

console.log('PASS staging E2E safety guard');

/** Staging destructive E2E 的網域與測試資料命名防呆。 */
import assert from 'node:assert/strict';
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

console.log('PASS staging E2E safety guard');

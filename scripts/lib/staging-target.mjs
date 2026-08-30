/** 嚴格限制會寫入資料的 E2E 只能對 Spin League 測試站執行。 */
export const STAGING_HOSTNAME = 'spin-league-test.ckvs4517.chatgpt.site';
export const E2E_NAME_PREFIX = '[E2E] ';

export function normalizeStagingUrl(value) {
  const url = new URL(String(value || ''));
  if (url.protocol !== 'https:') throw new Error('Staging E2E 只接受 HTTPS 網址。');
  if (url.hostname !== STAGING_HOSTNAME) {
    throw new Error(`拒絕執行 destructive E2E：只允許 ${STAGING_HOSTNAME}，目前為 ${url.hostname || '(empty)'}`);
  }
  url.pathname = '/';
  url.search = '';
  url.hash = '';
  return url;
}

export function createE2ETournamentName(now = Date.now(), random = Math.random()) {
  const suffix = `${Number(now).toString(36)}-${Math.floor(Number(random) * 0xffffff).toString(36).padStart(5, '0')}`;
  return `${E2E_NAME_PREFIX}Staging ${suffix}`;
}

export function assertE2ETournamentName(name) {
  if (!String(name || '').startsWith(E2E_NAME_PREFIX)) {
    throw new Error(`拒絕刪除非 ${E2E_NAME_PREFIX} 賽事：${String(name || '(empty)')}`);
  }
  return name;
}

/** 賽事公開分享深連結與 QR Code URL 測試。 */
import { sharedTournamentIdFromHash, tournamentQrImageUrl, tournamentShareUrl } from '../src/core/tournament-share.js';

assert(sharedTournamentIdFromHash('#schedule/1787288400000') === 1787288400000, '可從公開賽事 hash 解析賽事 ID');
assert(sharedTournamentIdFromHash('#schedule') === null, '一般賽程列表 hash 不會誤判賽事 ID');
assert(sharedTournamentIdFromHash('#schedule/not-a-number') === null, '無效賽事 ID 會被拒絕');
assert(sharedTournamentIdFromHash('#home/1787288400000') === null, '非賽程 route 不會解析賽事 ID');

const shareUrl = tournamentShareUrl(1787288400000, 'https://spin-league-tournament.ckvs4517.chatgpt.site/#schedule');
assert(shareUrl === 'https://spin-league-tournament.ckvs4517.chatgpt.site/#schedule/1787288400000', '分享網址直接指向指定賽事');

const qrUrl = new URL(tournamentQrImageUrl(shareUrl));
assert(qrUrl.origin === 'https://quickchart.io' && qrUrl.pathname === '/qr', 'QR Code 使用 HTTPS 圖片端點');
assert(qrUrl.searchParams.get('text') === shareUrl, 'QR Code 內容等於公開賽事網址');
assert(qrUrl.searchParams.get('size') === '320', 'QR Code 使用清楚的顯示尺寸');

console.log('PASS 8 tournament share tests');

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`PASS ${message}`);
}

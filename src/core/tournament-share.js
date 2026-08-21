/** 公開賽事分享網址與 QR Code URL 的純函式。 */
export function sharedTournamentIdFromHash(hash) {
  const [route, rawId] = String(hash || '').replace(/^#/, '').split('/');
  if (route !== 'schedule' || !/^\d+$/.test(rawId || '')) return null;
  const id = Number(rawId);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function tournamentShareUrl(tournamentId, currentHref) {
  const id = Number(tournamentId);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('賽事 ID 不正確。');
  const url = new URL(String(currentHref));
  url.hash = `schedule/${id}`;
  return url.toString();
}

export function tournamentQrImageUrl(shareUrl) {
  const url = new URL('https://quickchart.io/qr');
  url.searchParams.set('text', String(shareUrl));
  url.searchParams.set('size', '320');
  url.searchParams.set('margin', '2');
  url.searchParams.set('ecLevel', 'M');
  return url.toString();
}

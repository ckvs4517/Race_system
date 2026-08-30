/** Arena and event metadata validation/normalization. */


export function validateArenaCount(value) {
  const count = Number(value);
  if (!Number.isInteger(count) || count < 1 || count > 8) throw new Error('戰鬥台數需要介於 1 至 8 台。');
  return count;
}

export function normalizeStoredArenaCount(value) {
  const count = Number(value);
  return Number.isInteger(count) && count >= 1 && count <= 8 ? count : 1;
}

export function normalizeEventInfo(value = {}) {
  const info = value && typeof value === 'object' ? value : {};
  return {
    date: cleanEventText(info.date, 10, '比賽日期'),
    checkInStart: cleanEventText(info.checkInStart, 5, '報到開始時間'),
    checkInEnd: cleanEventText(info.checkInEnd, 5, '報到截止時間'),
    startTime: cleanEventText(info.startTime, 5, '開賽時間'),
    venueName: cleanEventText(info.venueName, 80, '比賽地點'),
    address: cleanEventText(info.address, 160, '地址'),
    mapUrl: cleanEventUrl(info.mapUrl, '地圖連結'),
    postUrl: cleanEventUrl(info.postUrl, '貼文連結'),
    notes: cleanEventText(info.notes, 2000, '備註'),
  };
}

function cleanEventText(value, maximumLength, label) {
  const text = String(value || '').trim();
  if (text.length > maximumLength) throw new Error(`${label}內容過長。`);
  return text;
}

function cleanEventUrl(value, label) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (text.length > 500) throw new Error(`${label}內容過長。`);
  try {
    const url = new URL(text);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error();
    return url.toString();
  } catch {
    throw new Error(`${label}必須是有效的 http 或 https 網址。`);
  }
}

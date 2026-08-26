/** Schedule 畫面使用的賽事日期格式與本地日期鍵。 */
export function formatEventDate(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${Number(match[1])}/${Number(match[2])}/${Number(match[3])}` : '';
}

export function localDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

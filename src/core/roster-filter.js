/** 將報到狀態篩選與名稱搜尋組合成同一個交集條件。 */
export function rosterPlayerMatches(name, checkedIn, filter = 'all', query = '') {
  const normalizedQuery = String(query || '').trim().toLocaleLowerCase('zh-Hant');
  const nameMatches = !normalizedQuery || String(name || '').toLocaleLowerCase('zh-Hant').includes(normalizedQuery);
  const statusMatches = filter === 'all'
    || (filter === 'checked' && Boolean(checkedIn))
    || (filter === 'unchecked' && !checkedIn);
  return nameMatches && statusMatches;
}

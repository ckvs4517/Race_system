/** 管理者可追蹤的 Level 1 Repair audit history。 */
import { escapeText } from './html-escape.js';

export function repairHistoryView(tournament, canManage) {
  const history = Array.isArray(tournament.repairHistory) ? tournament.repairHistory : [];
  if (!canManage || !history.length) return '';

  const rows = [...history].reverse().map((entry) => {
    const before = entry.before || {};
    const after = entry.after || {};
    const timestamp = formatRepairTime(entry.timestamp);
    const changes = Array.isArray(entry.changes) ? entry.changes : [];
    const changeText = changes.length
      ? changes.map((change) => {
        const parts = [
          `勝場 ${Number(change.winsBefore) || 0}→${Number(change.winsAfter) || 0}`,
          `排名 ${change.rankBefore ?? '—'}→${change.rankAfter ?? '—'}`,
        ];
        return `${escapeText(change.player)}：${parts.join(' · ')}`;
      }).join('；')
      : '無額外排名欄位變化';
    const locked = (entry.lockedRoundIndexes || []).map((index) => `Round ${Number(index) + 1}`).join('、') || '無';
    return `<article class="repair-history-entry">
      <div class="repair-history-entry-heading"><b>${escapeText(entry.roundName || `Round ${Number(entry.roundIndex) + 1}`)}</b><time>${escapeText(timestamp)}</time></div>
      <p><strong>${escapeText(before.playerA || entry.playerA || '')} ${before.scoreA ?? '—'}：${before.scoreB ?? '—'} ${escapeText(before.playerB || entry.playerB || '')}</strong><span>→</span><strong>${escapeText(after.playerA || entry.playerA || '')} ${after.scoreA ?? '—'}：${after.scoreB ?? '—'} ${escapeText(after.playerB || entry.playerB || '')}</strong></p>
      <small>原因：${escapeText(entry.reason || '未填寫')}</small>
      <small>${changeText}</small>
      <small>LOCKED downstream：${escapeText(locked)}</small>
    </article>`;
  }).join('');

  return `<details class="repair-history-panel">
    <summary><span>比分修正紀錄</span><b>${history.length} 筆</b></summary>
    <div class="repair-history-list">${rows}</div>
  </details>`;
}

function formatRepairTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || '');
  return date.toLocaleString('zh-TW', { hour12: false });
}

/** 賽事近期/歷史列表的純 HTML 畫面。 */
import { getTournamentFormat } from '../../formats/registry.js';
import { icons } from '../../ui/icons.js';
import { pageHeader } from '../../ui/shell.js';
import { formatEventDate, localDateKey, normalizeEventDateKey } from './event-date.js';
import { escapeAttribute, escapeText } from './html-escape.js';

export function tournamentListView(tournaments, canManage = false) {
  const orderedTournaments = [...tournaments].sort(compareEventDates);
  const activeTournaments = orderedTournaments.filter((item) => item.status !== '已完成');
  const completedTournaments = orderedTournaments
    .filter((item) => item.status === '已完成')
    .sort(compareCompletedEventDates);
  const recentCompleted = completedTournaments.slice(0, 6);
  const recentCards = activeTournaments.map((item) => eventCardView(item, canManage)).join('');
  const completedCards = recentCompleted.map((item) => eventCardView(item, canManage)).join('');
  const historyRows = completedTournaments.map((item) => historyEventRow(item, canManage)).join('');
  const years = [...new Set(completedTournaments.map(eventListYear))].sort((a, b) => b.localeCompare(a));
  const formats = [...new Set(completedTournaments.map((item) => item.format))]
    .sort((a, b) => getTournamentFormat(a).name.localeCompare(getTournamentFormat(b).name, 'zh-TW'));
  const createButton = canManage ? '<button class="button button-primary" data-route="manage">＋ 建立新賽事</button>' : '<button class="button button-secondary" data-route="control">主辦方登入</button>';
  if (!tournaments.length) return `<section class="section-wrap page-section">${pageHeader('TOURNAMENTS', '賽程表', '公開查看已建立的賽事、每輪對戰與即時排名。', createButton)}<div class="empty-state"><div>${icons.bracket}</div><h2>還沒有任何賽事</h2><p>主辦方建立賽事後，公開賽程會顯示在這裡。</p>${createButton}</div></section>`;
  return `<section class="section-wrap page-section tournament-list-page" data-tournament-list>
    ${pageHeader('TOURNAMENTS', '賽程表', '近期賽事優先顯示；已完成的舊賽事可到歷史賽事搜尋。', createButton)}
    <div class="tournament-list-tabs" role="tablist" aria-label="賽事列表分類">
      <button type="button" class="is-active" role="tab" aria-selected="true" data-tournament-list-tab="recent">近期賽事 <span>${activeTournaments.length + recentCompleted.length}</span></button>
      <button type="button" role="tab" aria-selected="false" data-tournament-list-tab="history">歷史賽事 <span>${completedTournaments.length}</span></button>
    </div>
    <div data-tournament-list-panel="recent">
      <section class="tournament-list-group">
        <div class="tournament-list-heading"><div><p class="kicker">CURRENT EVENTS</p><h2>目前賽事</h2></div><span>${activeTournaments.length ? `${activeTournaments.length} 場待處理` : '目前沒有待處理賽事'}</span></div>
        ${recentCards ? `<div class="event-grid">${recentCards}</div>` : '<div class="tournament-list-empty">目前沒有準備中、排程中或進行中的賽事。</div>'}
      </section>
      ${completedTournaments.length ? `<section class="tournament-list-group recent-completed-group"><div class="tournament-list-heading"><div><p class="kicker">RECENTLY COMPLETED</p><h2>最近完成</h2></div><button type="button" class="history-link" data-tournament-list-tab="history">查看全部 ${completedTournaments.length} 場歷史賽事 ${icons.arrow}</button></div><div class="event-grid event-grid-recent">${completedCards}</div></section>` : ''}
    </div>
    <div data-tournament-list-panel="history" hidden>
      <section class="history-panel">
        <div class="tournament-list-heading"><div><p class="kicker">ARCHIVE</p><h2>歷史賽事</h2></div><span data-history-count>${completedTournaments.length} 場</span></div>
        ${completedTournaments.length ? `<div class="history-tools"><label class="history-search"><span class="sr-only">搜尋歷史賽事</span><input type="search" placeholder="搜尋賽事名稱或場地" data-history-search></label><label><span>年份</span><select data-history-year><option value="all">全部年份</option>${years.map((year) => `<option value="${escapeAttribute(year)}">${year === 'other' ? '未設定年份' : `${year} 年`}</option>`).join('')}</select></label><label><span>賽制</span><select data-history-format><option value="all">全部賽制</option>${formats.map((format) => `<option value="${escapeAttribute(format)}">${escapeText(getTournamentFormat(format).name)}</option>`).join('')}</select></label></div><div class="history-list">${historyRows}</div><div class="history-filter-empty" data-history-empty hidden>找不到符合條件的歷史賽事。</div>` : '<div class="tournament-list-empty">尚無已完成的歷史賽事。</div>'}
      </section>
    </div>
  </section>`;
}

function eventCardView(item, canManage) {
  const status = item.status || '準備中';
  const statusClass = status === '進行中' ? 'is-live' : status === '排程中' ? 'is-scheduling' : status === '已完成' ? 'is-completed' : 'is-draft';
  return `<article class="event-card"><button class="event-open" data-tournament-id="${item.id}"><span class="event-status ${statusClass}"><i></i>${escapeText(status)}</span><div class="event-icon">${icons.trophy}</div><h2>${escapeText(item.name)}</h2><p>${item.players.length} 位選手 · ${escapeText(getTournamentFormat(item.format).name)} · ${item.arenaCount || 1} 台 · ${escapeText(formatEventDate(item.eventInfo?.date) || item.created)}</p>${item.eventInfo?.venueName ? `<small class="event-card-venue">${escapeText(item.eventInfo.venueName)}</small>` : ''}<span class="event-action">查看完整賽程 ${icons.arrow}</span></button>${eventListAdminMenu(item, canManage, 'card')}</article>`;
}

function historyEventRow(item, canManage) {
  const year = eventListYear(item);
  const search = `${item.name || ''} ${item.eventInfo?.venueName || ''}`.trim().toLocaleLowerCase('zh-TW');
  const date = formatEventDate(item.eventInfo?.date) || String(item.created || '').slice(0, 10) || '日期未設定';
  return `<article class="history-row" data-history-row data-history-year="${escapeAttribute(year)}" data-history-format="${escapeAttribute(item.format)}" data-history-search-text="${escapeAttribute(search)}"><button type="button" class="history-event-open" data-tournament-id="${item.id}"><time>${escapeText(date)}</time><span class="history-event-copy"><b>${escapeText(item.name)}</b><small>${item.players.length} 位選手 · ${escapeText(getTournamentFormat(item.format).name)}${item.eventInfo?.venueName ? ` · ${escapeText(item.eventInfo.venueName)}` : ''}</small></span><span class="history-status"><i></i>已完成</span><span class="history-open-label">查看 ${icons.arrow}</span></button>${eventListAdminMenu(item, canManage, 'history')}</article>`;
}

function eventListAdminMenu(item, canManage, placement) {
  if (!canManage) return '';
  return `<details class="event-more ${placement === 'history' ? 'history-event-more' : 'event-card-more'}"><summary aria-label="更多賽事操作">⋯</summary><div class="event-more-menu"><button class="event-copy" type="button" data-copy-tournament="${item.id}" data-tournament-name="${escapeAttribute(item.name)}">複製賽事</button><button class="event-delete" type="button" data-delete-tournament="${item.id}" data-tournament-name="${escapeAttribute(item.name)}" aria-label="刪除 ${escapeAttribute(item.name)}">刪除賽事</button></div></details>`;
}

function eventListYear(item) {
  const value = String(item.eventInfo?.date || item.created || '');
  return /^\d{4}/.test(value) ? value.slice(0, 4) : 'other';
}

function compareCompletedEventDates(left, right) {
  const leftDate = normalizeEventDateKey(left.eventInfo?.date) || normalizeEventDateKey(left.created);
  const rightDate = normalizeEventDateKey(right.eventInfo?.date) || normalizeEventDateKey(right.created);
  return rightDate.localeCompare(leftDate) || Number(right.id || 0) - Number(left.id || 0);
}

function compareEventDates(left, right) {
  const today = localDateKey(new Date());
  const leftDate = normalizeEventDateKey(left.eventInfo?.date);
  const rightDate = normalizeEventDateKey(right.eventInfo?.date);
  const group = (date) => !date ? 1 : date >= today ? 0 : 2;
  const groupDifference = group(leftDate) - group(rightDate);
  if (groupDifference) return groupDifference;
  if (leftDate && rightDate && leftDate !== rightDate) return group(leftDate) === 2 ? rightDate.localeCompare(leftDate) : leftDate.localeCompare(rightDate);
  return Number(right.id) - Number(left.id);
}

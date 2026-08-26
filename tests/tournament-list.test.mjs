/** 賽程列表：目前賽事優先，歷史賽事可搜尋篩選，近期完賽最多六場。 */
import assert from 'node:assert/strict';
import { createTournament } from '../src/domain/tournament.js';
import { scheduleView } from '../src/views/schedule.js';

const active = event('目前進行中', '2026-08-30', '進行中', 'swiss', 100);
const completed = Array.from({ length: 8 }, (_, index) => event(
  `歷史賽事 ${index + 1}`,
  `2026-08-${String(29 - index).padStart(2, '0')}`,
  '已完成',
  index % 2 ? 'single_elimination' : 'swiss',
  200 + index,
));
const view = scheduleView([active, ...completed], null, true);

assert.match(view, /data-tournament-list-tab="recent"/, '有近期賽事分頁');
assert.match(view, /data-tournament-list-tab="history"/, '有歷史賽事分頁');
assert.match(view, /搜尋賽事名稱或場地/, '歷史賽事提供搜尋');
assert.match(view, /data-history-year/, '歷史賽事提供年份篩選');
assert.match(view, /data-history-format/, '歷史賽事提供賽制篩選');
assert.equal((view.match(/class="event-card"/g) || []).length, 7, '近期頁只顯示目前賽事加最近六場完賽');
assert.equal((view.match(/data-history-row/g) || []).length, 8, '全部已完成賽事都保留在歷史列表');
assert.match(view, /event-card-more/, '管理操作收進卡片更多選單');
assert.match(view, /history-event-more/, '歷史列表也保留管理選單');
assert.match(view, /data-history-search-text="歷史賽事 1/, '歷史列提供可搜尋索引');

console.log('PASS tournament list organization');

function event(name, date, status, format, id) {
  return {
    ...createTournament(name, ['A', 'B', 'C', 'D'], format, 1, { date, venueName: '測試場地' }),
    id,
    status,
    created: `${date}T10:00:00.000Z`,
  };
}

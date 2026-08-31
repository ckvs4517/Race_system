import assert from 'node:assert/strict';
import { createTournament, duplicateTournament, normalizeTournament, updateDraftParticipant, updateDraftTournament } from '../src/domain/tournament.js';
import { createDefaultDrinkSettings } from '../src/domain/drinks.js';
import { createOverviewCsv } from '../src/views/data-management.js';
import { manageView } from '../src/views/manage.js';
import { scheduleView } from '../src/views/schedule.js';

const eventInfo = {
  date: '2026-07-25',
  checkInStart: '12:30',
  checkInEnd: '13:00',
  startTime: '13:15',
  venueName: '88coffee&tarttoo',
  address: '台北市測試路 88 號',
  mapUrl: 'https://maps.google.com/?q=test',
  postUrl: 'https://www.instagram.com/p/test/',
  notes: '禁用上蓋：測試\n報名費：$250',
};

const tournament = createTournament('活動資訊測試', ['A', 'B', 'C', 'D'], 'swiss', 2, eventInfo);
assert.deepEqual(tournament.eventInfo, eventInfo);

const publicView = scheduleView([tournament], tournament.id, false);
assert.match(publicView, /賽事資訊/);
assert.match(publicView, /<details class="event-info-panel">/);
assert.doesNotMatch(publicView, /<details class="event-info-panel" open/);
assert.match(publicView, /event-info-toggle/);
assert.match(publicView, /2026\/7\/25/);
assert.match(publicView, /12:30–13:00/);
assert.match(publicView, /88coffee&amp;tarttoo/);
assert.match(publicView, /開啟地圖/);
assert.match(publicView, /查看原始貼文/);
assert.match(publicView, /禁用上蓋：測試<br>報名費：\$250/);

const editView = manageView(tournament);
assert.match(editView, /name="eventDate" type="date" value="2026-07-25"/);
assert.match(editView, /name="venueName"[^>]+88coffee&amp;tarttoo/);
assert.match(editView, /name="notes"/);
assert.match(editView, /data-manage-participant-list/);
assert.match(editView, /name="participantNotes"/);
assert.doesNotMatch(editView, /飲品菜單/, '建立／編輯賽事不再提供飲品菜單');

const newTournamentView = manageView();
assert.match(newTournamentView, /name="venueName"[^>]+88coffee&amp;tattoo/);
assert.match(newTournamentView, /name="address"[^>]+臺北市中山區中吉里松江路170巷9之5號/);
assert.match(newTournamentView, /name="mapUrl"[^>]+https:\/\/maps\.app\.goo\.gl\/xtbmRtKcF84CCBec6/);
assert.match(newTournamentView, /data-manage-bulk-players/, '建立賽事保留批次貼上名單能力');
assert.doesNotMatch(newTournamentView, /飲品菜單/);

let noteDraft = updateDraftParticipant(tournament, 'A', 'A', { notes: '12345 · 無糖綠茶' });
assert.match(manageView(noteDraft), /value="12345 · 無糖綠茶"/, '編輯準備中賽事會帶回既有 participant notes');

let legacyDrinkDraft = createTournament('舊飲品草稿', ['A', 'B'], 'single_elimination', 1, {}, createDefaultDrinkSettings());
legacyDrinkDraft = updateDraftParticipant(legacyDrinkDraft, 'A', 'A', { drink: { itemId: 'juice' }, notes: '保留備註' });
legacyDrinkDraft = updateDraftTournament(legacyDrinkDraft, legacyDrinkDraft.name, ['A', 'B']);
assert.equal(legacyDrinkDraft.drinkSettings.enabled, true, '編輯舊草稿不會清掉既有 drinkSettings');
assert.equal(legacyDrinkDraft.participantDetails.A.drink.displayName, '果汁(無咖啡因)', '編輯舊草稿不會清掉既有 participant drink');
assert.equal(legacyDrinkDraft.participantDetails.A.notes, '保留備註');
assert.doesNotMatch(manageView(legacyDrinkDraft), /飲品菜單/, '舊飲品資料保留但不再提供編輯 UI');

const updated = updateDraftTournament(tournament, tournament.name, tournament.players, tournament.format, tournament.arenaCount, { ...eventInfo, startTime: '14:00' });
assert.equal(updated.eventInfo.startTime, '14:00');
assert.deepEqual(duplicateTournament(tournament).eventInfo, eventInfo);
assert.deepEqual(normalizeTournament({ ...tournament, eventInfo: undefined }).eventInfo, {
  date: '', checkInStart: '', checkInEnd: '', startTime: '', venueName: '', address: '', mapUrl: '', postUrl: '', notes: '',
});

const csv = createOverviewCsv([tournament]);
assert.match(csv, /"比賽日期"/);
assert.match(csv, /"88coffee&tarttoo"/);
assert.match(csv, /"https:\/\/www.instagram.com\/p\/test\/"/);

assert.throws(() => createTournament('錯誤網址', ['A', 'B'], 'single_elimination', 1, { mapUrl: 'javascript:alert(1)' }), /有效的 http 或 https 網址/);

const future = createTournament('未來賽事', ['A', 'B'], 'single_elimination', 1, { date: '2099-01-01' });
const undated = createTournament('未定日期', ['A', 'B']);
const past = createTournament('過去賽事', ['A', 'B'], 'single_elimination', 1, { date: '2000-01-01' });
const listView = scheduleView([past, undated, future], null, false);
assert.ok(listView.indexOf('未來賽事') < listView.indexOf('未定日期') && listView.indexOf('未定日期') < listView.indexOf('過去賽事'));


const mixedCompleted = [
  ['最近 8月26日', '2026-08-26'],
  ['舊格式 8月25日', '2026/8/25'],
  ['舊格式 8月24日', '2026/8/24'],
  ['舊格式 8月9日', '2026/8/9'],
  ['舊格式 7月31日', '2026/7/31'],
  ['舊格式 7月20日', '2026/7/20'],
  ['應只在歷史 7月19日', '2026/7/19'],
].map(([name, date], index) => ({
  ...past,
  id: 2026082600 + index,
  name,
  status: '已完成',
  eventInfo: { ...past.eventInfo, date },
}));
const mixedDateListView = scheduleView(mixedCompleted, null, false);
const recentStart = mixedDateListView.indexOf('<div class="event-grid event-grid-recent">');
const recentEnd = mixedDateListView.indexOf('</section>', recentStart);
const recentMarkup = mixedDateListView.slice(recentStart, recentEnd);
assert.match(recentMarkup, /最近 8月26日/);
assert.match(recentMarkup, /舊格式 8月25日/);
assert.doesNotMatch(recentMarkup, /應只在歷史 7月19日/);
assert.ok(recentMarkup.indexOf('最近 8月26日') < recentMarkup.indexOf('舊格式 8月25日'));
assert.ok(recentMarkup.indexOf('舊格式 8月25日') < recentMarkup.indexOf('舊格式 8月9日'));
assert.match(recentMarkup, /2026\/8\/26/);
assert.match(recentMarkup, /2026\/8\/9/);

const legacyFuture = { ...future, id: 20980102, name: '未來斜線格式', eventInfo: { ...future.eventInfo, date: '2098/1/2' } };
const standardFuture = { ...future, id: 20990101, name: '未來標準格式', eventInfo: { ...future.eventInfo, date: '2099-01-01' } };
const mixedActiveView = scheduleView([legacyFuture, standardFuture], null, false);
assert.ok(mixedActiveView.indexOf('未來斜線格式') < mixedActiveView.indexOf('未來標準格式'));

console.log('PASS event information fields');

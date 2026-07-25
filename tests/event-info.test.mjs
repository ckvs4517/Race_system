import assert from 'node:assert/strict';
import { createTournament, duplicateTournament, normalizeTournament, updateDraftTournament } from '../src/domain/tournament.js';
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

console.log('PASS event information fields');

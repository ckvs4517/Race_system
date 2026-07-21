import { createBackup, createCsv, createOverviewCsv, dataManagementView, parseBackup } from '../src/views/data-management.js';

const tournaments = [{
  id: 1,
  name: '夏季,「冠軍」賽',
  status: '已完成',
  created: '2026/07/21',
  players: ['小明', '阿龍'],
  champion: '小明',
  rounds: [{ name: '冠軍賽', matches: [{ playerA: '小明', playerB: '阿龍', scoreA: 5, scoreB: 3, winner: '小明', status: '已完成' }] }],
}];

const backup = createBackup(tournaments, '2026-07-21T00:00:00.000Z');
assert(backup.format === 'spin-league-backup' && backup.version === 1, '備份包含格式與版本資訊');
assert(parseBackup(JSON.stringify(backup)).tournaments[0].champion === '小明', '有效備份可以完整還原');
assertThrows(() => parseBackup('{broken'), '損壞的 JSON 會被拒絕');
assertThrows(() => parseBackup(JSON.stringify({ tournaments })), '非 Spin League 備份會被拒絕');

const csv = createCsv(tournaments);
assert(csv.includes('"夏季,「冠軍」賽"') && csv.includes('"冠軍賽"'), 'CSV 正確處理逗號並包含輪次');
assert(csv.includes('"5","3","小明","已完成"'), 'CSV 包含比分、勝者與比賽狀態');
const overviewCsv = createOverviewCsv(tournaments);
assert(overviewCsv.split('\r\n').length === 2 && overviewCsv.includes('"2","1","1"'), '賽事總覽 CSV 每場賽事只使用一列');
const view = dataManagementView(tournaments);
assert(view.includes('一列代表一場賽事') && view.includes('下載對戰明細 CSV'), '資料頁清楚說明兩種 CSV 的列資料意義');

console.log('PASS 8 data management tests');

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`PASS ${message}`);
}

function assertThrows(callback, message) {
  let threw = false;
  try { callback(); } catch { threw = true; }
  assert(threw, message);
}

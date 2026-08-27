/** 備份格式、損壞資料拒絕與兩種 CSV 匯出的測試。 */
import { createBackup, createCsv, createOverviewCsv, createParticipantsCsv, dataManagementView, parseBackup } from '../src/views/data-management.js';

const tournaments = [{
  id: 1,
  name: '夏季,「冠軍」賽',
  status: '已完成',
  created: '2026/07/21',
  players: ['小明', '阿龍'],
  champion: '小明',
  participantDetails: { 小明: { phone: '0912345678', drink: { displayName: '椰子咖啡／拿鐵' } } },
  participantStates: { 小明: { checkedIn: true, status: 'active' } },
  rounds: [{ name: '冠軍賽', matches: [{ playerA: '小明', playerB: '阿龍', scoreA: 5, scoreB: 3, winner: '小明', status: '已完成' }] }],
}];

const backup = createBackup(tournaments, '2026-07-21T00:00:00.000Z');
assert(backup.format === 'spin-league-backup' && backup.version === 1, '備份包含格式與版本資訊');
assert(parseBackup(JSON.stringify(backup)).tournaments[0].champion === '小明', '有效備份可以完整還原');
const largeTournament = { ...tournaments[0], id: 2, name: '48 人測試賽', status: '準備中', players: Array.from({ length: 48 }, (_, index) => `P${index + 1}`) };
assert(parseBackup(JSON.stringify(createBackup([largeTournament]))).tournaments[0].players.length === 48, '48 人賽事備份可以完整還原');
assertThrows(() => parseBackup('{broken'), '損壞的 JSON 會被拒絕');
assertThrows(() => parseBackup(JSON.stringify({ tournaments })), '非 Spin League 備份會被拒絕');

const csv = createCsv(tournaments);
assert(csv.includes('"夏季,「冠軍」賽"') && csv.includes('"冠軍賽"'), 'CSV 正確處理逗號並包含輪次');
assert(csv.includes('"5","3","小明","已完成"'), 'CSV 包含比分、勝者與比賽狀態');
const overviewCsv = createOverviewCsv(tournaments);
assert(overviewCsv.split('\r\n').length === 2 && overviewCsv.includes('"2","1","1"'), '賽事總覽 CSV 每場賽事只使用一列');
const view = dataManagementView(tournaments);
const participantCsv = createParticipantsCsv(tournaments);
assert(participantCsv.includes('"0912345678"') && participantCsv.includes('"椰子咖啡／拿鐵"'), '參賽者 CSV 包含電話與飲品');
assert(view.includes('一列代表一場賽事') && view.includes('下載參賽者與飲品 CSV'), '資料頁清楚說明各種 CSV 的列資料意義');

console.log('PASS 9 data management tests');

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`PASS ${message}`);
}

function assertThrows(callback, message) {
  let threw = false;
  try { callback(); } catch { threw = true; }
  assert(threw, message);
}

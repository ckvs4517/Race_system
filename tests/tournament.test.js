import { createTournament, normalizeTournament, recordMatchResult, startTournament, updateDraftTournament } from '../src/domain/tournament.js';
import { scheduleView } from '../src/views/schedule.js';
import { manageView } from '../src/views/manage.js';

const assertions = [];
function expect(condition, message) {
  if (!condition) throw new Error(message);
  assertions.push(message);
}

try {
  let tournament = createTournament('五人測試賽', ['A', 'B', 'C', 'D', 'E']);
  expect(tournament.status === '準備中', '新賽事建立後保持準備中');
  expect(tournament.rounds.length === 3, '五人賽產生三輪');
  expect(tournament.rounds[0].matches.filter((match) => match.status === '輪空晉級').length === 3, '三位選手自動輪空晉級');
  expect(tournament.rounds[0].matches[3].status === '可開始', '剩餘兩位選手可開始比賽');
  expect(tournament.rounds[1].matches[0].status === '可開始', '兩位輪空勝者已進入準決賽');

  tournament = updateDraftTournament(tournament, '五人測試賽', ['A', 'B', 'C', 'D', 'E']);
  expect(tournament.status === '準備中', '開始前可以編輯並重新產生賽程');
  tournament = startTournament(tournament);
  expect(tournament.status === '進行中', '按下賽事開始後進入進行中');
  tournament = recordMatchResult(tournament, 0, 3, 3, 1);
  expect(tournament.rounds[1].matches[1].playerB === 'D', '首輪勝者進入正確準決賽位置');
  expect(tournament.rounds[1].matches[1].status === '可開始', '第二場準決賽已可開始');

  tournament = recordMatchResult(tournament, 1, 0, 2, 3);
  tournament = recordMatchResult(tournament, 1, 1, 3, 0);
  expect(tournament.rounds[2].matches[0].status === '可開始', '兩場準決賽勝者進入冠軍賽');
  tournament = recordMatchResult(tournament, 2, 0, 4, 2);
  expect(tournament.champion === 'B', '冠軍與最終比分正確保存');
  expect(tournament.status === '已完成', '賽事完成狀態正確');

  const players32 = Array.from({ length: 32 }, (_, index) => `P${index + 1}`);
  const tournament32 = createTournament('32 人測試賽', players32);
  expect(tournament32.rounds.length === 5, '32 人賽產生五輪賽程');
  const draftView = scheduleView([tournament32], tournament32.id);
  expect(draftView.includes('data-action="edit-tournament"') && draftView.includes('data-action="start-tournament"'), '準備中賽事顯示編輯與開始按鈕');
  expect(manageView(tournament32).includes('2–32 位'), '編輯頁顯示 32 人上限');
  let editLocked = false;
  try { updateDraftTournament(startTournament(tournament32), '不能編輯', players32); } catch { editLocked = true; }
  expect(editLocked, '賽事開始後參賽名單鎖定');

  const migrated = normalizeTournament({ id: 1, name: '舊賽事', players: ['甲', '乙', '丙'] });
  expect(migrated.rounds[0].matches[0].status === '輪空晉級', '舊資料可轉換並自動處理輪空');
  expect(migrated.status === '準備中', '尚未記分的舊賽事轉為可編輯的準備中狀態');
  expect(scheduleView([tournament], null).includes('data-delete-tournament'), '賽事列表提供獨立刪除按鈕');

  document.querySelector('#result').textContent = `PASS ${assertions.length}\n${assertions.join('\n')}`;
} catch (error) {
  document.querySelector('#result').textContent = `FAIL\n${error.stack}`;
}

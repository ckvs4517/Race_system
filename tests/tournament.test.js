import { createTournament, drawRandomSeeds, normalizeTournament, recordMatchResult, requiredSeedCount, startTournament, updateDraftTournament } from '../src/domain/tournament.js';
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
  expect(requiredSeedCount(tournament) === 3, '五人賽需要三位種子選手');
  expect(tournament.rounds.length === 0, '抽選種子前不產生正式預覽賽程');
  const waitingView = scheduleView([tournament], tournament.id);
  expect(waitingView.includes('data-action="draw-seeds"') && waitingView.includes('等待種子抽選'), '分支圖顯示隨機抽選種子入口');
  expect(waitingView.includes('data-action="start-tournament" disabled'), '尚未抽選種子時不能開始賽事');

  let startBlocked = false;
  try { startTournament(tournament); } catch { startBlocked = true; }
  expect(startBlocked, '未抽選種子時資料層拒絕開始賽事');

  tournament = drawRandomSeeds(tournament, () => 0);
  expect(tournament.seedPlayerIndexes.length === 3 && new Set(tournament.seedPlayerIndexes).size === 3, '隨機抽出所需且不重複的種子選手');
  expect(tournament.rounds.length === 3, '完成抽選後五人賽產生三輪');
  expect(tournament.rounds[0].matches.filter((match) => match.status === '輪空晉級').length === 3, '三位種子選手首輪輪空');
  expect(tournament.rounds[0].matches[3].status === '可開始', '剩餘兩位選手配對比賽');
  expect(scheduleView([tournament], tournament.id).includes('重新抽選種子'), '開始前可以重新抽選種子');
  const legacyDraft = normalizeTournament({ ...tournament, seedPlayerIndexes: undefined, status: '進行中' });
  expect(legacyDraft.status === '準備中' && legacyDraft.rounds.length === 0, '舊版未開始賽事改為等待公平抽選種子');

  tournament = updateDraftTournament(tournament, '五人測試賽', ['A', 'B', 'C', 'D', 'E']);
  expect(tournament.seedPlayerIndexes.length === 0 && tournament.rounds.length === 0, '修改名單後清除舊種子並等待重抽');
  tournament = drawRandomSeeds(tournament, () => 0);
  tournament = startTournament(tournament);
  expect(tournament.status === '進行中', '完成抽選後可正式開始賽事');

  let seedLocked = false;
  try { drawRandomSeeds(tournament); } catch { seedLocked = true; }
  expect(seedLocked, '賽事開始後種子選手鎖定');

  const openingMatch = tournament.rounds[0].matches[3];
  tournament = recordMatchResult(tournament, 0, 3, 3, 1);
  expect(tournament.rounds[1].matches[1].playerB === openingMatch.playerA, '首輪勝者進入正確準決賽位置');
  expect(tournament.rounds[1].matches[1].status === '可開始', '第二場準決賽已可開始');
  tournament = recordMatchResult(tournament, 1, 0, 2, 3);
  tournament = recordMatchResult(tournament, 1, 1, 3, 0);
  expect(tournament.rounds[2].matches[0].status === '可開始', '兩場準決賽勝者進入冠軍賽');
  tournament = recordMatchResult(tournament, 2, 0, 4, 2);
  expect(Boolean(tournament.champion), '冠軍與最終比分正確保存');
  expect(tournament.status === '已完成', '賽事完成狀態正確');

  const players32 = Array.from({ length: 32 }, (_, index) => `P${index + 1}`);
  const tournament32 = createTournament('32 人測試賽', players32);
  expect(requiredSeedCount(tournament32) === 0 && tournament32.rounds.length === 5, '32 人賽不需種子輪空並產生五輪');
  const draftView = scheduleView([tournament32], tournament32.id);
  expect(draftView.includes('data-action="edit-tournament"') && draftView.includes('data-action="start-tournament"'), '滿編準備中賽事可直接開始');
  expect(manageView(tournament32).includes('2–32 位'), '編輯頁顯示 32 人上限');
  let editLocked = false;
  try { updateDraftTournament(startTournament(tournament32), '不能編輯', players32); } catch { editLocked = true; }
  expect(editLocked, '賽事開始後參賽名單鎖定');

  const migrated = normalizeTournament({ id: 1, name: '舊賽事', players: ['甲', '乙', '丙'] });
  expect(migrated.rounds.length === 0 && migrated.status === '準備中', '未比賽的舊資料轉為等待種子抽選');
  expect(scheduleView([tournament], null).includes('data-delete-tournament'), '賽事列表提供獨立刪除按鈕');

  document.querySelector('#result').textContent = `PASS ${assertions.length}\n${assertions.join('\n')}`;
} catch (error) {
  document.querySelector('#result').textContent = `FAIL\n${error.stack}`;
}

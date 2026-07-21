import { buildRounds, createTournament, drawRandomSeeds, normalizeTournament, recordMatchResult, requiredSeedCount, startTournament, updateDraftTournament } from '../src/domain/tournament.js';
import { getTournamentFormat } from '../src/formats/registry.js';
import { scheduleView } from '../src/views/schedule.js';
import { manageView } from '../src/views/manage.js';

const assertions = [];
function expect(condition, message) {
  if (!condition) throw new Error(message);
  assertions.push(message);
}

try {
  let tournament = createTournament('五人測試賽', ['A', 'B', 'C', 'D', 'E']);
  expect(tournament.format === 'single_elimination' && getTournamentFormat(tournament.format).name === '單淘汰賽', '種子與配對規則綁定單淘汰賽制');
  expect(tournament.status === '準備中', '新賽事建立後保持準備中');
  expect(requiredSeedCount(tournament) === 1, '奇數五人賽只需要一位首輪種子');
  expect(tournament.rounds.length === 0, '抽選種子前不產生正式預覽賽程');
  const waitingView = scheduleView([tournament], tournament.id);
  expect(waitingView.includes('data-action="draw-seeds"') && waitingView.includes('等待種子抽選'), '分支圖顯示隨機抽選種子入口');
  expect(waitingView.includes('data-action="start-tournament" disabled'), '尚未抽選種子時不能開始賽事');

  tournament = drawRandomSeeds(tournament, () => 0);
  expect(tournament.seedPlayerIndexes.length === 1, '首輪隨機抽出一位種子選手');
  expect(tournament.rounds[0].matches.filter((match) => match.status === '輪空晉級').length === 1, '只有一位首輪種子直接晉級');
  expect(tournament.rounds[0].matches.filter((match) => match.status === '可開始').length === 2, '其餘四位選手完成兩組配對');
  expect(buildRounds(tournament).length === 3, '五人賽分支圖顯示三輪結構');
  expect(scheduleView([tournament], tournament.id).includes('重新抽選種子'), '開始前可以重新抽選首輪種子');

  tournament = updateDraftTournament(tournament, '五人測試賽', ['A', 'B', 'C', 'D', 'E']);
  expect(tournament.seedPlayerIndexes.length === 0 && tournament.rounds.length === 0, '修改名單後清除舊種子並等待重抽');
  tournament = startTournament(drawRandomSeeds(tournament, () => 0));
  expect(tournament.status === '進行中', '完成抽選後可正式開始賽事');
  let seedLocked = false;
  try { drawRandomSeeds(tournament); } catch { seedLocked = true; }
  expect(seedLocked, '賽事開始後首輪種子鎖定');

  const openingPlayable = tournament.rounds[0].matches.filter((match) => match.status === '可開始');
  tournament = recordById(tournament, openingPlayable[0].id, 5, 0);
  tournament = recordById(tournament, openingPlayable[1].id, 3, 1);
  const highScoreWinner = openingPlayable[0].playerA;
  expect(tournament.rounds.length === 2, '首輪完成後動態建立下一輪');
  expect(tournament.rounds[1].seedReason === 'performance', '後續奇數輪使用表現種子規則');
  expect(tournament.rounds[1].seedPlayer === highScoreWinner, '平均得分較高者成為後續輪次種子');
  expect(tournament.playerStats[highScoreWinner].byeCount === 1, '後續表現種子的輪空次數被記錄');

  const secondRoundMatch = tournament.rounds[1].matches.find((match) => match.status === '可開始');
  tournament = recordById(tournament, secondRoundMatch.id, 4, 2);
  expect(tournament.rounds.length === 3 && tournament.rounds[2].name === '冠軍賽', '下一輪完成後建立冠軍賽');
  const finalMatch = tournament.rounds[2].matches[0];
  tournament = recordById(tournament, finalMatch.id, 3, 1);
  expect(Boolean(tournament.champion) && tournament.status === '已完成', '冠軍與賽事完成狀態正確保存');

  let evenTournament = createTournament('六人測試賽', ['P1', 'P2', 'P3', 'P4', 'P5', 'P6']);
  expect(requiredSeedCount(evenTournament) === 0, '偶數六人賽首輪不抽種子');
  expect(evenTournament.rounds[0].matches.length === 3 && evenTournament.rounds[0].matches.every((match) => match.status === '可開始'), '六位選手第一輪全部完成三組配對');
  expect(!scheduleView([evenTournament], evenTournament.id).includes('data-action="draw-seeds"'), '偶數賽事不顯示首輪抽種子按鈕');
  evenTournament = startTournament(evenTournament);
  evenTournament = recordById(evenTournament, 'r1m1', 4, 3);
  evenTournament = recordById(evenTournament, 'r1m2', 4, 1);
  evenTournament = recordById(evenTournament, 'r1m3', 3, 0);
  expect(evenTournament.rounds[1].seedPlayer === 'P3', '平均得分相同時以得失分差決定後續種子');

  const players32 = Array.from({ length: 32 }, (_, index) => `P${index + 1}`);
  const tournament32 = createTournament('32 人測試賽', players32);
  expect(requiredSeedCount(tournament32) === 0 && buildRounds(tournament32).length === 5, '32 人賽不需首輪種子並顯示五輪');
  expect(manageView(tournament32).includes('2–32 位'), '編輯頁顯示 32 人上限');
  let editLocked = false;
  try { updateDraftTournament(startTournament(tournament32), '不能編輯', players32); } catch { editLocked = true; }
  expect(editLocked, '賽事開始後參賽名單鎖定');

  const migrated = normalizeTournament({ id: 1, name: '舊賽事', players: ['甲', '乙', '丙'] });
  expect(migrated.bracketVersion === 2 && migrated.rounds.length === 0, '未比賽的舊資料轉為新版單淘汰規則並等待抽選');
  expect(scheduleView([tournament], null).includes('data-delete-tournament'), '賽事列表提供獨立刪除按鈕');

  document.querySelector('#result').textContent = `PASS ${assertions.length}\n${assertions.join('\n')}`;
} catch (error) {
  document.querySelector('#result').textContent = `FAIL\n${error.stack}`;
}

function recordById(tournament, matchId, scoreA, scoreB) {
  const roundIndex = tournament.rounds.findIndex((round) => round.matches.some((match) => match.id === matchId));
  const matchIndex = tournament.rounds[roundIndex].matches.findIndex((match) => match.id === matchId);
  return recordMatchResult(tournament, roundIndex, matchIndex, scoreA, scoreB, () => 0);
}

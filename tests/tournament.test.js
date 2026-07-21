import { buildRounds, createTournament, drawRandomSeeds, duplicateTournament, getTournamentStandings, normalizeTournament, recordMatchResult, requiredSeedCount, resetCompletedMatch, startTournament, updateDraftTournament } from '../src/domain/tournament.js';
import { getTournamentFormat } from '../src/formats/registry.js';
import { scheduleView } from '../src/views/schedule.js';
import { manageView } from '../src/views/manage.js';
import { scoreboardView } from '../src/views/scoreboard.js';

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
  const standings = getTournamentStandings(tournament);
  expect(standings[0].player === tournament.champion && standings[0].rank === 1, '排行榜將冠軍固定列為第一名');
  expect(standings.every((row) => Number.isInteger(row.wins) && Number.isInteger(row.losses)), '排行榜提供每位選手的勝敗場次');
  expect(standings.some((row) => row.totalPoints > 0), '排行榜累積每位選手的總得分');
  const completedView = scheduleView([tournament], tournament.id);
  expect(completedView.includes('賽事排行榜'), '賽事結束頁顯示排行榜');
  expect(completedView.includes('data-replay-round'), '已完成的對戰節點提供重新比賽按鈕');
  expect(!scoreboardView({ mode: 'match', tournamentName: '測試', roundName: '第一輪', playerA: 'A', playerB: 'B' }).includes('data-action="restart-match"'), '尚未送出結果的記分板不顯示重新比賽按鈕');

  const openingMatchIndex = tournament.rounds[0].matches.findIndex((match) => match.id === openingPlayable[0].id);
  const replayedTournament = resetCompletedMatch(tournament, 0, openingMatchIndex);
  const replayedMatch = replayedTournament.rounds[0].matches[openingMatchIndex];
  expect(replayedTournament.status === '進行中' && !replayedTournament.champion, '重開已完成比賽會讓賽事回到進行中並清除冠軍');
  expect(replayedTournament.rounds.length === 1 && replayedMatch.status === '可開始', '重開前段比賽會清除後續輪次並讓該場回到可開始');
  expect(replayedMatch.scoreA === null && replayedMatch.scoreB === null && replayedMatch.winner === null, '重開比賽會清除該場比分與勝者');
  expect(replayedTournament.playerStats[replayedMatch.playerA].matchesPlayed === 0, '重開後會依保留結果重新計算選手統計');

  const copiedTournament = duplicateTournament(tournament);
  expect(copiedTournament.id !== tournament.id && copiedTournament.name === '五人測試賽（副本）', '複製賽事會建立不同識別碼的新副本');
  expect(copiedTournament.status === '準備中' && copiedTournament.players.join(',') === tournament.players.join(','), '賽事副本保留選手名單並回到準備中');
  expect(copiedTournament.rounds.length === 0 && copiedTournament.seedPlayerIndexes.length === 0 && !copiedTournament.champion, '賽事副本不保留種子、比分與冠軍');
  expect(completedView.includes('data-action="copy-current-tournament"'), '賽事內容頁提供複製賽事按鈕');

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
  const tournamentListView = scheduleView([tournament], null);
  expect(tournamentListView.includes('data-delete-tournament'), '賽事列表提供獨立刪除按鈕');
  expect(tournamentListView.includes('data-copy-tournament'), '賽事列表提供獨立複製按鈕');

  document.querySelector('#result').textContent = `PASS ${assertions.length}\n${assertions.join('\n')}`;
} catch (error) {
  document.querySelector('#result').textContent = `FAIL\n${error.stack}`;
}

function recordById(tournament, matchId, scoreA, scoreB) {
  const roundIndex = tournament.rounds.findIndex((round) => round.matches.some((match) => match.id === matchId));
  const matchIndex = tournament.rounds[roundIndex].matches.findIndex((match) => match.id === matchId);
  return recordMatchResult(tournament, roundIndex, matchIndex, scoreA, scoreB, () => 0);
}

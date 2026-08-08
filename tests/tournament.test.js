/** 瀏覽器領域測試：涵蓋單淘汰、種子、重賽、棄賽、退賽與畫面輸出。 */
import { buildRounds, confirmTournamentSchedule, createTournament, duplicateTournament, forfeitMatch, getTournamentStandings, normalizeTournament, prepareTournamentSchedule, randomizeDraftTournament, randomizeTournamentSchedule, recordMatchResult, requiredSeedCount, resetCompletedMatch, setDraftPlayerCheckedIn, startTournament, updateDraftTournament, updateOpeningPairings, withdrawPlayer } from '../src/domain/tournament.js';
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
  expect(scheduleView([tournament], tournament.id, true).includes('已報到 0／報名 5 人'), '新賽事先顯示尚未報到的完整選手名單');
  tournament = checkInAll(tournament);
  expect(tournament.rounds.length === 0, '報到階段不提前產生正式預覽賽程');
  const waitingView = scheduleView([tournament], tournament.id, true);
  expect(waitingView.includes('data-action="prepare-tournament-schedule"'), '完成報到後可進入排程階段');
  expect(waitingView.includes('完成報到後再產生賽程') && !waitingView.includes('MATCH 01'), '開始排程前不顯示對戰節點');

  const originalOrder = ['甲', '乙', '丙', '丁'];
  const randomized = randomizeDraftTournament(checkInAll(createTournament('隨機分組測試', originalOrder)), () => 0);
  expect(randomized.players.join(',') === '乙,丙,丁,甲', '隨機分組使用 Fisher-Yates 重新排列參賽者');
  expect(new Set(randomized.players).size === originalOrder.length && originalOrder.every((player) => randomized.players.includes(player)), '隨機分組不會遺失或重複參賽者');
  expect(randomized.rounds.length === 0, '報到階段調整名單順序也不會提前產生賽程');

  tournament = updateDraftTournament(tournament, '五人測試賽', ['A', 'B', 'C', 'D', 'E']);
  expect(tournament.rounds.length === 0, '修改名單後仍保持無賽程狀態');
  let scheduling = prepareTournamentSchedule(tournament);
  expect(scheduling.status === '排程中' && scheduling.rounds.length === 0, '確認報到後進入獨立排程階段');
  scheduling = randomizeTournamentSchedule(scheduling, () => 0);
  expect(scheduling.rounds[0].matches.filter((match) => match.status === '輪空晉級').length === 1, '奇數人隨機分組會安排一位輪空');
  expect(scheduling.rounds[0].matches.filter((match) => match.status === '可開始').length === 2, '其餘四位選手完成兩組配對');
  expect(buildRounds(scheduling).length === 3, '排程階段可預覽完整單淘汰分支');
  expect(scheduleView([scheduling], scheduling.id, true).includes('data-opening-pairings-form'), '排程階段提供首輪對戰調整表單');
  scheduling = updateOpeningPairings(scheduling, [['A', 'B'], ['C', 'D'], ['E', '輪空']]);
  expect(scheduling.rounds[0].matches[0].playerA === 'A' && scheduling.rounds[0].matches[0].playerB === 'B', '主辦方可自由指定首輪誰對誰');
  tournament = confirmTournamentSchedule(scheduling);
  expect(tournament.status === '進行中', '確認目前賽程後才正式開放比賽');
  let randomizeLocked = false;
  try { randomizeDraftTournament(tournament); } catch { randomizeLocked = true; }
  expect(randomizeLocked, '賽事開始後隨機分組鎖定');

  const openingPlayable = tournament.rounds[0].matches.filter((match) => match.status === '可開始');
  tournament = recordById(tournament, openingPlayable[0].id, 5, 0);
  tournament = recordById(tournament, openingPlayable[1].id, 4, 1);
  const highScoreWinner = openingPlayable[0].playerA;
  expect(tournament.rounds.length === 2, '首輪完成後動態建立下一輪');
  expect(tournament.rounds[1].seedReason === 'performance', '後續奇數輪使用表現種子規則');
  expect(tournament.rounds[1].seedPlayer === highScoreWinner, '平均得分較高者成為後續輪次種子');
  expect(tournament.playerStats[highScoreWinner].byeCount === 1, '後續表現種子的輪空次數被記錄');

  const secondRoundMatch = tournament.rounds[1].matches.find((match) => match.status === '可開始');
  tournament = recordById(tournament, secondRoundMatch.id, 4, 2);
  expect(tournament.rounds.length === 3 && tournament.rounds[2].name === '冠軍賽', '下一輪完成後建立冠軍賽');
  const finalMatch = tournament.rounds[2].matches[0];
  tournament = recordById(tournament, finalMatch.id, 4, 1);
  expect(Boolean(tournament.champion) && tournament.status === '已完成', '冠軍與賽事完成狀態正確保存');
  const standings = getTournamentStandings(tournament);
  expect(standings[0].player === tournament.champion && standings[0].rank === 1, '排行榜將冠軍固定列為第一名');
  expect(standings.every((row) => Number.isInteger(row.wins) && Number.isInteger(row.losses)), '排行榜提供每位選手的勝敗場次');
  expect(standings.some((row) => row.totalPoints > 0), '排行榜累積每位選手的總得分');
  const completedView = scheduleView([tournament], tournament.id, true);
  expect(completedView.includes('賽事排行榜'), '賽事結束頁顯示排行榜');
  expect(completedView.includes('data-replay-round'), '已完成的對戰節點提供重新比賽按鈕');
  expect(!scoreboardView({ mode: 'match', tournamentName: '測試', roundName: '第一輪', playerA: 'A', playerB: 'B' }).includes('data-action="restart-match"'), '尚未送出結果的記分板不顯示重新比賽按鈕');
  expect(scoreboardView({ mode: 'match', tournamentName: '測試', roundName: '第一輪', playerA: 'A', playerB: 'B' }).includes('data-forfeit-player="A"'), '正式記分板提供選手棄賽判定入口');

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

  let lowWinningScoreRejected = false;
  const scoreValidationTournament = startTournament(checkInAll(createTournament('四分制測試', ['S1', 'S2'])));
  try { recordMatchResult(scoreValidationTournament, 0, 0, 3, 1); } catch { lowWinningScoreRejected = true; }
  expect(lowWinningScoreRejected, '正常比賽勝方未達 4 分時不能送出結果');

  let administrativeTournament = startTournament(checkInAll(createTournament('行政判定測試', ['F1', 'F2', 'F3', 'F4'])));
  const forfeitedPlayer = administrativeTournament.rounds[0].matches[0].playerA;
  administrativeTournament = forfeitMatch(administrativeTournament, 0, 0, forfeitedPlayer);
  const forfeitedMatch = administrativeTournament.rounds[0].matches[0];
  expect(forfeitedMatch.outcome === 'forfeit' && forfeitedMatch.forfeitPlayer === forfeitedPlayer, '單場棄賽會保存行政判定與棄賽選手');
  expect(Math.max(forfeitedMatch.scoreA, forfeitedMatch.scoreB) === 4 && Math.min(forfeitedMatch.scoreA, forfeitedMatch.scoreB) === 0, '單場棄賽以 4 比 0 判定');
  const absentPlayer = administrativeTournament.rounds[0].matches[1].playerA;
  administrativeTournament = withdrawPlayer(administrativeTournament, absentPlayer, 'no_show');
  expect(administrativeTournament.participantStates[absentPlayer].status === 'no_show', '開賽後可將未到選手標記為未出席');
  expect(administrativeTournament.rounds[0].matches[1].outcome === 'withdrawal' && administrativeTournament.rounds.length === 2, '未出席選手的對手不戰勝並正常產生下一輪');

  const rankingStatusTournament = {
    ...administrativeTournament,
    participantStates: {
      '實際參賽 0-4': { checkedIn: true, status: 'active' },
      '未報到高分': { checkedIn: false, status: 'active' },
    },
    players: ['實際參賽 0-4', '未報到高分'],
    playerStats: {
      '實際參賽 0-4': { wins: 0, losses: 4, pointsFor: 0, pointsAgainst: 16 },
      '未報到高分': { wins: 4, losses: 0, pointsFor: 16, pointsAgainst: 0 },
    },
  };
  const rankingRows = getTournamentStandings(rankingStatusTournament);
  expect(rankingRows[0].player === '實際參賽 0-4', '單淘汰排行榜將已報到的 0-4 選手排在未報到者前面');
  const administrativeView = scheduleView([administrativeTournament], administrativeTournament.id, true);
  expect(forfeitedMatch.outcome === 'forfeit' && !administrativeView.includes('data-restore-player'), '賽程保存退賽判定且不提供恢復入口');

  let swissWithdrawal = startTournament(checkInAll(createTournament('瑞士退賽測試', ['W1', 'W2', 'W3', 'W4'], 'swiss')));
  const swissWithdrawnPlayer = swissWithdrawal.rounds[0].matches[0].playerA;
  swissWithdrawal = withdrawPlayer(swissWithdrawal, swissWithdrawnPlayer);
  const swissRemainingMatchIndex = swissWithdrawal.rounds[0].matches.findIndex((match) => match.status === '可開始');
  swissWithdrawal = forfeitMatch(swissWithdrawal, 0, swissRemainingMatchIndex, swissWithdrawal.rounds[0].matches[swissRemainingMatchIndex].playerB);
  expect(!swissWithdrawal.rounds[1].matches.some((match) => [match.playerA, match.playerB].includes(swissWithdrawnPlayer)), '退賽選手不會進入瑞士制後續配對');

  let evenTournament = checkInAll(createTournament('六人測試賽', ['P1', 'P2', 'P3', 'P4', 'P5', 'P6']));
  expect(requiredSeedCount(evenTournament) === 0, '偶數六人賽首輪不抽種子');
  expect(evenTournament.rounds.length === 0, '六位選手完成報到後仍不提前配對');
  expect(!scheduleView([evenTournament], evenTournament.id, true).includes('data-action="draw-seeds"'), '偶數賽事不顯示首輪抽種子按鈕');
  evenTournament = startTournament(evenTournament);
  expect(evenTournament.rounds[0].matches.length === 3 && evenTournament.rounds[0].matches.every((match) => match.status === '可開始'), '六位選手正式開始後完成三組配對');
  evenTournament = recordById(evenTournament, 'r1m1', 4, 3);
  evenTournament = recordById(evenTournament, 'r1m2', 4, 1);
  evenTournament = recordById(evenTournament, 'r1m3', 4, 2);
  expect(evenTournament.rounds[1].seedPlayer === evenTournament.rounds[0].matches[1].winner, '平均得分相同時以得失分差決定後續種子');

  const players32 = Array.from({ length: 32 }, (_, index) => `P${index + 1}`);
  const tournament32 = checkInAll(createTournament('32 人測試賽', players32));
  expect(requiredSeedCount(tournament32) === 0 && buildRounds(tournament32).length === 0, '32 人賽報到階段也不提前顯示賽程');
  expect(buildRounds(startTournament(tournament32)).length === 5, '32 人賽確認賽程後顯示五輪');
  expect(manageView(tournament32).includes('依賽制限制報到人數'), '編輯頁顯示依賽制的人數限制');
  let editLocked = false;
  try { updateDraftTournament(startTournament(tournament32), '不能編輯', players32); } catch { editLocked = true; }
  expect(editLocked, '賽事開始後參賽名單鎖定');

  const migrated = normalizeTournament({ id: 1, name: '舊賽事', players: ['甲', '乙', '丙'] });
  expect(migrated.bracketVersion === 2 && migrated.rounds.length === 0, '未比賽的舊資料轉為新版單淘汰規則並等待抽選');
  const tournamentListView = scheduleView([tournament], null, true);
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

function checkInAll(tournament) {
  return tournament.players.reduce((current, player) => setDraftPlayerCheckedIn(current, player, true), tournament);
}

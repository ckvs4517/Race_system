/** 瑞士制專項測試：配對、輪空、分組、排名、退賽與多戰鬥台。 */
import assert from 'node:assert/strict';
import {
  buildRounds,
  createTournament,
  forfeitMatch,
  getTournamentStandings,
  randomizeDraftTournament,
  recordMatchResult,
  requiredSeedCount,
  resetCompletedMatch,
  startSwissFinal,
  startSwissQualifier,
  startTournament,
  updateDraftTournament,
  withdrawPlayer,
} from '../src/domain/tournament.js';
import { createTournamentImageModel } from '../src/export/tournament-image.js';
import { manageView } from '../src/views/manage.js';
import { scheduleView } from '../src/views/schedule.js';

const players = Array.from({ length: 8 }, (_, index) => `選手 ${index + 1}`);
let tournament = createTournament('八人瑞士賽', players, 'swiss');

assert.equal(tournament.format, 'swiss');
assert.equal(tournament.totalRounds, 4);
assert.equal(requiredSeedCount(tournament), 0);
assert.equal(tournament.rounds.length, 1);
assert.equal(tournament.rounds[0].matches.length, 4);
assert.equal(buildRounds(tournament).length, 1, '瑞士制不應投影尚未配對的輪次');

tournament = randomizeDraftTournament(tournament, () => 0);
assert.equal(new Set(tournament.players).size, players.length);
tournament = startTournament(tournament);
assert.match(scheduleView([tournament], tournament.id, true), /瑞士制/);
assert.match(scheduleView([tournament], tournament.id, true), /LIVE STANDINGS/);

const rankingProbe = {
  ...createTournament('同戰績排序', ['高分選手', '低分選手', '全勝選手', '未勝選手'], 'swiss'),
  status: '進行中',
  swissStage: 'qualification',
  rounds: [
    {
      name: '測試第一輪',
      phase: 'preliminary',
      matches: [
        completedMatch('probe-1', '全勝選手', '高分選手', 5, 3),
        completedMatch('probe-2', '低分選手', '未勝選手', 4, 0),
      ],
    },
    {
      name: '測試第二輪',
      phase: 'preliminary',
      matches: [
        completedMatch('probe-3', '全勝選手', '低分選手', 4, 1),
        completedMatch('probe-4', '高分選手', '未勝選手', 4, 0),
      ],
    },
  ],
};
const rankingProbeRows = getTournamentStandings(rankingProbe);
assert.deepEqual(rankingProbeRows.map((row) => row.player), ['全勝選手', '高分選手', '低分選手', '未勝選手']);
assert.deepEqual(rankingProbeRows.map((row) => row.rank), [1, 2, 3, 4], '勝敗相同時以總得分拆分名次');

while (tournament.swissStage === 'preliminary') tournament = finishCurrentRound(tournament);
assert.equal(tournament.status, '進行中');
assert.equal(tournament.swissStage, 'qualification');
assert.equal(tournament.rounds.length, 4);
assert.equal(tournament.champion, null);
assertNoRepeatedPairings(tournament.rounds);
const qualificationView = scheduleView([tournament], tournament.id, true);
assert.match(qualificationView, /四強資格確認/);

const preliminary = getTournamentStandings(tournament);
assert.ok(preliminary.every((row) => Number.isInteger(row.totalPoints)), '排行榜列出總得分');
assertRecordAndPointsOrder(preliminary);
const initialFinalForm = qualificationView.match(/<form data-swiss-final-form>[\s\S]*?<\/form>/)?.[0] || '';
assert.equal((initialFinalForm.match(/name="finalist"/g) || []).length, 4, '直接確認四強只列排行榜前四名');
assert.ok(preliminary.slice(0, 4).every((row) => initialFinalForm.includes(row.player)), '直接四強包含排行榜前四名');
const qualifierPlayers = preliminary.slice(2, 6).map((row) => row.player);
tournament = startSwissQualifier(tournament, qualifierPlayers);
assert.equal(tournament.swissStage, 'qualifier');
while (tournament.swissStage === 'qualifier') tournament = finishCurrentRound(tournament);
assert.equal(tournament.swissStage, 'qualification');
const postQualifierView = scheduleView([tournament], tournament.id, true);
const postQualifierFinalForm = postQualifierView.match(/<form data-swiss-final-form>[\s\S]*?<\/form>/)?.[0] || '';
assert.equal((postQualifierFinalForm.match(/name="finalist"/g) || []).length, 4, '資格加賽後仍只列四位確定晉級者');

const finalists = preliminary.slice(0, 4).map((row) => row.player);
tournament = { ...tournament, arenaCount: 2 };
tournament = startSwissFinal(tournament, finalists);
assert.equal(tournament.swissStage, 'final');
const finalView = scheduleView([tournament], tournament.id, true);
assert.match(finalView, /1 台戰鬥台/, '四強頁面標示單一戰鬥台');
assert.doesNotMatch(finalView, /戰鬥台 2|battle-stations/, '四強循環決賽固定使用一台戰鬥台');
while (tournament.swissStage === 'final') tournament = finishCurrentRound(tournament);
assert.equal(tournament.status, '已完成');
assert.equal(tournament.swissStage, 'completed');
assert.ok(tournament.champion);
assert.equal(getTournamentStandings(tournament)[0].player, tournament.champion);
const completedView = scheduleView([tournament], tournament.id, true);
assert.match(completedView, /TOP 4 FINAL/);
assert.match(completedView, /下載完整賽程圖/);
assert.doesNotMatch(completedView, /勝者組|敗者組|QUALIFIER|ROUND 01/, '四強決賽後不再顯示前面的預賽與資格賽');
assert.match(completedView, /round-column is-completed/);
assert.doesNotMatch(completedView, /round-column is-completed[^>]*\sopen/);
const imageModel = createTournamentImageModel(tournament);
assert.equal(imageModel.rounds.length, tournament.rounds.length, '賽程圖保留畫面已隱藏的全部歷史輪次');
assert.ok(imageModel.rounds.some((round) => round.phase === '資格加賽'));
assert.ok(imageModel.rounds.some((round) => round.phase === '四強決賽'));
assert.ok(imageModel.rounds.every((round) => round.matches.every((match) => match.playerA && match.playerB)));

const reset = resetCompletedMatch(tournament, 0, 0);
assert.equal(reset.status, '進行中');
assert.equal(reset.rounds.length, 1);
assert.equal(reset.rounds[0].matches[0].status, '可開始');

let odd = startTournament(createTournament('五人瑞士賽', ['A', 'B', 'C', 'D', 'E'], 'swiss'));
const firstBye = odd.rounds[0].seedPlayer;
assert.ok(firstBye);
assert.equal(odd.playerStats[firstBye].wins, 1, '輪空應計為一勝');
odd = finishCurrentRound(odd);
assert.notEqual(odd.rounds[1].seedPlayer, firstBye, '有其他選擇時不可連續輪空');

let swissWithdrawal = startTournament(createTournament('瑞士退賽測試', ['W1', 'W2', 'W3', 'W4'], 'swiss'));
const withdrawalMatch = swissWithdrawal.rounds[0].matches[0];
swissWithdrawal = withdrawPlayer(swissWithdrawal, withdrawalMatch.playerA);
assert.equal(swissWithdrawal.rounds[0].matches[0].outcome, 'withdrawal');
const remainingMatchIndex = swissWithdrawal.rounds[0].matches.findIndex((match) => match.status === '可開始');
swissWithdrawal = forfeitMatch(swissWithdrawal, 0, remainingMatchIndex, swissWithdrawal.rounds[0].matches[remainingMatchIndex].playerB);
assert.ok(!swissWithdrawal.rounds[1].matches.some((match) => [match.playerA, match.playerB].includes(withdrawalMatch.playerA)), '退賽選手不進入瑞士制後續配對');

let changed = createTournament('切換賽制', ['A', 'B', 'C', 'D']);
changed = updateDraftTournament(changed, changed.name, changed.players, 'swiss');
assert.equal(changed.format, 'swiss');
assert.equal(changed.totalRounds, 4);
assert.match(manageView(changed), /option value="swiss" selected/);
assert.match(manageView(), /瑞士制/);
assert.match(manageView(), /name="arenaCount"/);

const multiArena = createTournament('雙台瑞士賽', players, 'swiss', 2);
assert.equal(multiArena.arenaCount, 2);
const multiArenaView = scheduleView([multiArena], multiArena.id, true);
assert.match(multiArenaView, /戰鬥台 1/);
assert.match(multiArenaView, /戰鬥台 2/);
assert.match(multiArenaView, /battle-stations/);

let invalidArenaRejected = false;
try { createTournament('錯誤台數', players, 'swiss', 9); } catch { invalidArenaRejected = true; }
assert.equal(invalidArenaRejected, true);

console.log('PASS Swiss format');

function finishCurrentRound(source) {
  let result = source;
  const roundIndex = result.rounds.findIndex((round) => round.matches.some((match) => match.status === '可開始'));
  const matchIds = result.rounds[roundIndex].matches.filter((match) => match.status === '可開始').map((match) => match.id);
  matchIds.forEach((id, index) => {
    const matchIndex = result.rounds[roundIndex].matches.findIndex((match) => match.id === id);
    result = recordMatchResult(result, roundIndex, matchIndex, 7, index);
  });
  return result;
}

function assertNoRepeatedPairings(rounds) {
  const seen = new Set();
  rounds.forEach((round) => round.matches.forEach((match) => {
    if (match.playerB === '輪空') return;
    const key = [match.playerA, match.playerB].sort().join('|');
    assert.ok(!seen.has(key), `重複配對：${key}`);
    seen.add(key);
  }));
}

function assertRecordAndPointsOrder(rows) {
  rows.slice(1).forEach((row, index) => {
    const previous = rows[index];
    if (previous.wins === row.wins && previous.losses === row.losses) {
      assert.ok(previous.totalPoints >= row.totalPoints, '勝敗相同時總得分較高者排前面');
      if (previous.totalPoints > row.totalPoints) assert.ok(previous.rank < row.rank, '總得分不同時不可並列名次');
    }
  });
}

function completedMatch(id, playerA, playerB, scoreA, scoreB) {
  return {
    id,
    playerA,
    playerB,
    scoreA,
    scoreB,
    winner: scoreA > scoreB ? playerA : playerB,
    status: '已完成',
  };
}

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as tournamentDomain from '../src/domain/tournament.js';
import { scheduleView } from '../src/views/schedule.js';

const {
  createTournament,
  getTournamentStandings,
  recordMatchResult,
  resetCompletedMatch,
  startSwissFinal,
  startSwissQualifier,
} = tournamentDomain;

// 回歸：資格加賽完成後若主控按「重新比賽」，必須恢復同一組 qualifier，
// 不可因引用不存在的 round 變數而丟出 ReferenceError。
let qualifier = activeSwiss(['A', 'B', 'C', 'D']);
qualifier = startSwissQualifier(qualifier, ['A', 'B']);
assert.equal(qualifier.swissStage, 'qualifier');
assert.equal(qualifier.activeQualifierSeriesId, 'qualifier-1');

qualifier = recordMatchResult(qualifier, 0, 0, 4, 2);
assert.equal(qualifier.swissStage, 'qualification', '資格加賽完成後回到四強資格確認');
assert.equal(qualifier.rounds[0].matches[0].status, '已完成');

const replayedQualifier = resetCompletedMatch(qualifier, 0, 0);
assert.equal(replayedQualifier.status, '進行中');
assert.equal(replayedQualifier.swissStage, 'qualifier', '重賽後重新進入 qualifier 階段');
assert.equal(replayedQualifier.activeQualifierSeriesId, 'qualifier-1', '重賽仍綁定原資格加賽 series');
assert.equal(replayedQualifier.rounds.length, 1, '回退時只保留重賽所在輪次以前的資料');
assert.equal(replayedQualifier.rounds[0].matches[0].status, '可開始');
assert.equal(replayedQualifier.rounds[0].matches[0].scoreA, null);
assert.equal(replayedQualifier.rounds[0].matches[0].scoreB, null);

// 兩人勝敗、總得分完全相同時，新機制用直接對戰分出名次；UI 必須說明原因。
const twoWayOutcomes = new Map([
  [pairKey('B', 'D'), ['B', 0]],
  [pairKey('A', 'C'), ['C', 0]],
  [pairKey('B', 'C'), ['B', 0]],
  [pairKey('D', 'A'), ['A', 0]],
  [pairKey('B', 'A'), ['A', 0]],
  [pairKey('C', 'D'), ['D', 0]],
]);
const resolvedTwoWay = finishFinal(startFinal(['B', 'A', 'C', 'D']), 'final', twoWayOutcomes);
assert.equal(resolvedTwoWay.status, '已完成');
assert.equal(resolvedTwoWay.champion, 'A');
const twoWayRows = getTournamentStandings(resolvedTwoWay);
assert.deepEqual(twoWayRows.slice(0, 2).map((row) => row.player), ['A', 'B']);
assert.equal(twoWayRows[0].wins, twoWayRows[1].wins);
assert.equal(twoWayRows[0].losses, twoWayRows[1].losses);
assert.equal(twoWayRows[0].totalPoints, twoWayRows[1].totalPoints);

const twoWayHtml = scheduleView([resolvedTwoWay], resolvedTwoWay.id, true);
assert.match(twoWayHtml, /兩人完全同分時比較直接對戰/, '排行榜說明直接對戰 tie-break 規則');
assert.match(twoWayHtml, /直接對戰優勢/, '排名較高者標示直接對戰優勢');
assert.match(twoWayHtml, /直接對戰劣勢/, '排名較低者標示直接對戰劣勢');
assert.doesNotMatch(twoWayHtml, /data-swiss-final-tiebreak-form|data-final-tie-standings/, '不再顯示舊手動冠軍加賽操作');

// 三人以上互咬完全同分時，只走新版自動循環加賽，不回到舊手動選人流程。
const threeWayOutcomes = new Map([
  [pairKey('A', 'D'), ['A', 0]],
  [pairKey('B', 'C'), ['B', 3]],
  [pairKey('A', 'C'), ['C', 3]],
  [pairKey('D', 'B'), ['B', 0]],
  [pairKey('A', 'B'), ['A', 3]],
  [pairKey('C', 'D'), ['C', 0]],
]);
const automaticTieBreak = finishFinal(startFinal(['A', 'B', 'C', 'D']), 'final', threeWayOutcomes);
assert.equal(automaticTieBreak.status, '進行中');
assert.equal(automaticTieBreak.swissStage, 'final');
assert.equal(automaticTieBreak.finalTie, true);
assert.equal(automaticTieBreak.finalTieBreakCount, 1);
assert.ok(automaticTieBreak.rounds.some((round) => round.seriesId === 'final-tiebreak-1'));

const automaticTieHtml = scheduleView([automaticTieBreak], automaticTieBreak.id, true);
assert.match(automaticTieHtml, /AUTOMATIC TIE BREAK/);
assert.match(automaticTieHtml, /四強同分加賽進行中/);
assert.match(automaticTieHtml, /系統已依規則自動建立循環加賽/);
assert.doesNotMatch(automaticTieHtml, /data-swiss-final-tiebreak-form|data-final-tie-standings/);

// 舊 domain / API / UI 入口必須完全移除，避免未來又出現兩套四強同分規則。
assert.equal('startSwissFinalTieBreak' in tournamentDomain, false);
assert.equal('confirmSwissFinalTie' in tournamentDomain, false);
const [workerSource, mainSource, scheduleSource] = await Promise.all([
  readFile(new URL('../worker/index.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/views/schedule.js', import.meta.url), 'utf8'),
]);
for (const source of [workerSource, mainSource, scheduleSource]) {
  assert.doesNotMatch(source, /start_swiss_final_tiebreak|confirm_swiss_final_tie|data-swiss-final-tiebreak-form|data-final-tie-standings/);
}

console.log('PASS Swiss replay, automatic final tie-break, and ranking explanation');

function activeSwiss(players) {
  const base = createTournament('Swiss regression', players, 'swiss');
  return {
    ...base,
    status: '進行中',
    swissStage: 'qualification',
    participantStates: Object.fromEntries(players.map((player) => [player, { checkedIn: true, status: 'active' }])),
    rounds: [],
  };
}

function startFinal(players) {
  return startSwissFinal(activeSwiss(players), players, 'round_robin');
}

function finishFinal(source, seriesId, outcomes) {
  let tournament = structuredClone(source);
  while (true) {
    const roundIndex = tournament.rounds.findIndex((round) => round.seriesId === seriesId
      && round.matches.some((match) => match.status === '可開始'));
    if (roundIndex < 0) break;
    const activeIds = tournament.rounds[roundIndex].matches
      .filter((match) => match.status === '可開始')
      .map((match) => match.id);
    for (const id of activeIds) {
      const matchIndex = tournament.rounds[roundIndex].matches.findIndex((match) => match.id === id);
      const match = tournament.rounds[roundIndex].matches[matchIndex];
      const outcome = outcomes.get(pairKey(match.playerA, match.playerB));
      assert.ok(outcome, `缺少測試結果：${match.playerA} vs ${match.playerB}`);
      const [winner, loserScore] = outcome;
      const scoreA = match.playerA === winner ? 4 : loserScore;
      const scoreB = match.playerB === winner ? 4 : loserScore;
      tournament = recordMatchResult(tournament, roundIndex, matchIndex, scoreA, scoreB);
    }
  }
  return tournament;
}

function pairKey(a, b) {
  return [a, b].sort().join('|');
}

import assert from 'node:assert/strict';
import { swiss } from '../src/formats/swiss.js';

const twoWay = startFinal(['B', 'A', 'C', 'D']);
const twoWayOutcomes = new Map([
  [pairKey('B', 'D'), ['B', 0]],
  [pairKey('A', 'C'), ['C', 0]],
  [pairKey('B', 'C'), ['B', 0]],
  [pairKey('D', 'A'), ['A', 0]],
  [pairKey('B', 'A'), ['A', 0]],
  [pairKey('C', 'D'), ['D', 0]],
]);
const resolvedTwoWay = finishSeries(twoWay, 'final', twoWayOutcomes);
assert.equal(resolvedTwoWay.swissStage, 'completed');
assert.equal(resolvedTwoWay.champion, 'A', '同勝敗同總分時應由直接對戰勝者取得冠軍');
assert.equal(resolvedTwoWay.finalTie, false);
const twoWayStandings = swiss.getStandings(resolvedTwoWay);
assert.deepEqual(twoWayStandings.slice(0, 2).map((row) => row.player), ['A', 'B']);
assert.deepEqual(twoWayStandings.slice(0, 2).map((row) => row.rank), [1, 2]);
assert.equal(twoWayStandings[0].wins, twoWayStandings[1].wins);
assert.equal(twoWayStandings[0].losses, twoWayStandings[1].losses);
assert.equal(twoWayStandings[0].totalPoints, twoWayStandings[1].totalPoints);
assert.equal(twoWayStandings[0].totalPoints, 8, '重現 2 勝 1 敗、總分 8 分同分案例');

const threeWay = startFinal(['A', 'B', 'C', 'D']);
const threeWayOutcomes = new Map([
  [pairKey('A', 'D'), ['A', 0]],
  [pairKey('B', 'C'), ['B', 3]],
  [pairKey('A', 'C'), ['C', 3]],
  [pairKey('D', 'B'), ['B', 0]],
  [pairKey('A', 'B'), ['A', 3]],
  [pairKey('C', 'D'), ['C', 0]],
]);
const needsTieBreak = finishSeries(threeWay, 'final', threeWayOutcomes);
assert.equal(needsTieBreak.swissStage, 'final', '三人互咬同分時賽事不可直接結束');
assert.equal(needsTieBreak.champion, null, '多方同分不可任意指定冠軍');
assert.equal(needsTieBreak.finalTie, true);
assert.equal(needsTieBreak.finalTieBreakCount, 1);
assert.ok(needsTieBreak.rounds.some((round) => round.seriesId === 'final-tiebreak-1'));
const tiedRows = swiss.getStandings(needsTieBreak).filter((row) => row.rank === 1);
assert.deepEqual(new Set(tiedRows.map((row) => row.player)), new Set(['A', 'B', 'C']));

const tieBreakOutcomes = new Map([
  [pairKey('B', 'C'), ['B', 0]],
  [pairKey('A', 'C'), ['A', 0]],
  [pairKey('A', 'B'), ['A', 0]],
]);
const resolvedThreeWay = finishSeries(needsTieBreak, 'final-tiebreak-1', tieBreakOutcomes);
assert.equal(resolvedThreeWay.swissStage, 'completed');
assert.equal(resolvedThreeWay.champion, 'A');
assert.equal(swiss.getStandings(resolvedThreeWay)[0].player, 'A');

console.log('PASS Swiss final tie-break');

function startFinal(players) {
  const tournament = {
    players: [...players],
    rounds: [],
    swissStage: 'qualification',
    swissFinalMode: null,
    finalists: [],
    champion: null,
    participantStates: Object.fromEntries(players.map((player) => [player, { checkedIn: true, status: 'active' }])),
  };
  return swiss.startFinal(tournament, players, 'round_robin');
}

function finishSeries(source, seriesId, outcomes) {
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
      tournament = { ...tournament, ...swiss.recordResult(tournament, roundIndex, matchIndex, scoreA, scoreB) };
    }
  }
  return tournament;
}

function pairKey(a, b) {
  return [a, b].sort().join('|');
}

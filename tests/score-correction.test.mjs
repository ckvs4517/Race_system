/** Historical score correction: Level 0 updates in place, higher impact is blocked for later Repair Flow. */
import assert from 'node:assert/strict';
import {
  analyzeMatchScoreCorrection,
  correctMatchScore,
  createTournament,
  recordMatchResult,
  setDraftPlayerCheckedIn,
  startTournament,
} from '../src/domain/tournament.js';
import { scheduleView } from '../src/views/schedule.js';
import { applyTournamentAction } from '../worker/services/tournament-actions.js';

let elimination = startTournament(checkInAll(createTournament('安全修正單淘汰', ['A', 'B', 'C', 'D'], 'single_elimination')));
elimination = recordMatchResult(elimination, 0, 0, 4, 2);
elimination = recordMatchResult(elimination, 0, 1, 4, 1);
assert.equal(elimination.rounds.length, 2, '首輪完成後已正式產生下一輪');
const originalWinner = elimination.rounds[0].matches[0].winner;
const downstreamBefore = structuredClone(elimination.rounds[1]);
const corrected = correctMatchScore(elimination, 0, 0, 5, 1);
assert.equal(corrected.rounds[0].matches[0].scoreA, 5);
assert.equal(corrected.rounds[0].matches[0].scoreB, 1);
assert.equal(corrected.rounds[0].matches[0].winner, originalWinner, 'Level 0 不改 winner');
assert.deepEqual(corrected.rounds[1], downstreamBefore, 'Level 0 不清除或重排 downstream Round');
assert.equal(corrected.rounds.length, elimination.rounds.length, 'Level 0 保留所有已產生 Round');
assert.throws(
  () => correctMatchScore(elimination, 0, 0, 2, 4),
  /晉級結果|Repair Flow/,
  '單淘汰 winner-changing 修正必須阻擋',
);

const workerCorrected = applyTournamentAction(corrected, 'correct_match_score', {
  roundIndex: 0,
  matchIndex: 0,
  scoreA: 6,
  scoreB: 1,
});
assert.equal(workerCorrected.rounds[0].matches[0].scoreA, 6, 'Worker action 重新走 domain score correction');
assert.deepEqual(workerCorrected.rounds[1], downstreamBefore, 'Worker Level 0 action 也不得改 downstream Round');

const adminView = scheduleView([elimination], elimination.id, true);
assert.match(adminView, /data-correct-round="0"/, '管理者在已完成 Match 看到單一修正比分入口');
assert.match(adminView, />修正比分<\//);
const publicView = scheduleView([elimination], elimination.id, false);
assert.doesNotMatch(publicView, /data-correct-round=/, '公開頁不可顯示比分修正入口');

const swissSafe = syntheticTournament('swiss', [
  completedMatch('s1', 'A', 'B', 8, 2),
  completedMatch('s2', 'C', 'D', 4, 0),
]);
const swissSafeImpact = analyzeMatchScoreCorrection(swissSafe, 0, 0, 7, 2);
assert.equal(swissSafeImpact.level, 0, 'Swiss 同 winner 且排名未變可安全修正');
const swissCorrected = correctMatchScore(swissSafe, 0, 0, 7, 2);
assert.equal(swissCorrected.rounds[0].matches[0].scoreA, 7);

const swissRankingChange = syntheticTournament('swiss', [
  completedMatch('sr1', 'A', 'B', 4, 0),
  completedMatch('sr2', 'C', 'D', 6, 0),
]);
const swissImpact = analyzeMatchScoreCorrection(swissRankingChange, 0, 0, 7, 0);
assert.equal(swissImpact.level, 1, 'Swiss 即使 winner 不變，只要排名會變仍應升級 Repair');
assert.match(swissImpact.message, /排名|Repair Flow/);
assert.throws(() => correctMatchScore(swissRankingChange, 0, 0, 7, 0), /排名|Repair Flow/);

const roundRobinRankingChange = syntheticTournament('round_robin', [
  completedMatch('rr1', 'A', 'B', 4, 0),
  completedMatch('rr2', 'C', 'D', 6, 0),
]);
const roundRobinImpact = analyzeMatchScoreCorrection(roundRobinRankingChange, 0, 0, 7, 0);
assert.equal(roundRobinImpact.level, 1, 'Round Robin 也不能只用 winner 判斷 Level 0');

const administrative = structuredClone(elimination);
administrative.rounds[0].matches[0].outcome = 'forfeit';
administrative.rounds[0].matches[0].forfeitPlayer = administrative.rounds[0].matches[0].playerB;
assert.throws(
  () => correctMatchScore(administrative, 0, 0, 5, 0),
  /行政判定/,
  '一般比分修正不得覆寫棄賽／退賽語意',
);

console.log('PASS Level 0 score correction');

function syntheticTournament(format, matches) {
  const players = ['A', 'B', 'C', 'D'];
  const base = createTournament(`修正測試-${format}`, players, format);
  return {
    ...base,
    status: '進行中',
    swissStage: format === 'swiss' ? 'qualification' : base.swissStage,
    participantStates: Object.fromEntries(players.map((player) => [player, { checkedIn: true, status: 'active' }])),
    rounds: [{
      name: '測試第 1 輪',
      phase: 'preliminary',
      phaseRound: 1,
      seriesId: format === 'round_robin' ? 'round_robin' : 'preliminary',
      seriesPlayers: [...players],
      matches,
    }],
  };
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
    completedAt: '2026-09-10T00:00:00.000Z',
  };
}

function checkInAll(tournament) {
  return tournament.players.reduce((current, player) => setDraftPlayerCheckedIn(current, player, true), tournament);
}

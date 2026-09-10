/** Historical score correction: Level 0 direct updates and Level 1 safe Repair Flow. */
import assert from 'node:assert/strict';
import {
  analyzeMatchScoreCorrection,
  correctMatchScore,
  createTournament,
  getSwissPhaseStandings,
  normalizeTournament,
  recordMatchResult,
  repairMatchScore,
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
const eliminationStructural = analyzeMatchScoreCorrection(elimination, 0, 0, 2, 4);
assert.equal(eliminationStructural.level, 2, '單淘汰 winner-changing 明確分類為 Level 2');
assert.equal(eliminationStructural.repairable, false, '第一版不支援單淘汰結構修復');
assert.throws(
  () => repairMatchScore(elimination, 0, 0, 2, 4, '反向輸入'),
  /晉級結果|Repair Flow/,
  '單淘汰 winner-changing Repair 必須阻擋',
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
assert.equal(swissImpact.repairable, true, 'Swiss preliminary Level 1 可進入 Repair Flow');
assert.match(swissImpact.message, /排名|Repair Flow/);
assert.throws(() => correctMatchScore(swissRankingChange, 0, 0, 7, 0), /排名|Repair Flow/);

const roundRobinRankingChange = syntheticTournament('round_robin', [
  completedMatch('rr1', 'A', 'B', 4, 0),
  completedMatch('rr2', 'C', 'D', 6, 0),
]);
const roundRobinImpact = analyzeMatchScoreCorrection(roundRobinRankingChange, 0, 0, 7, 0);
assert.equal(roundRobinImpact.level, 1, 'Round Robin 也不能只用 winner 判斷 Level 0');
assert.equal(roundRobinImpact.repairable, true, '一般 Round Robin Level 1 可進入 Repair Flow');

const administrative = structuredClone(elimination);
administrative.rounds[0].matches[0].outcome = 'forfeit';
administrative.rounds[0].matches[0].forfeitPlayer = administrative.rounds[0].matches[0].playerB;
assert.throws(
  () => repairMatchScore(administrative, 0, 0, 5, 0, '裁判修正'),
  /行政判定/,
  '一般 Repair 不得覆寫棄賽／退賽語意',
);
assert.throws(
  () => repairMatchScore(swissRankingChange, 0, 0, 7, 0, ''),
  /修正原因/,
  'Level 1 Repair 必須留下原因',
);

// 真實 Swiss：Round 2 已開始後修正 Round 1 winner，Round 2 必須完整保留。
let swiss = startTournament(checkInAll(createTournament('Swiss Repair', ['甲', '乙', '丙', '丁'], 'swiss')));
swiss = completeRound(swiss, 0, [[4, 1], [4, 0]]);
assert.equal(swiss.rounds.length, 2, '完成 Swiss Round 1 後已產生 Round 2');
swiss = recordMatchResult(swiss, 1, 0, 4, 1, () => 0);
const swissBeforeRepair = structuredClone(swiss);
const targetSwiss = swiss.rounds[0].matches[0];
const repairedScores = targetSwiss.winner === targetSwiss.playerA ? [2, 4] : [4, 2];
const realSwissImpact = analyzeMatchScoreCorrection(swiss, 0, 0, ...repairedScores);
assert.equal(realSwissImpact.level, 1);
assert.equal(realSwissImpact.repairable, true);
assert.deepEqual(realSwissImpact.preview.preservedRoundIndexes, [1], '已產生的 Round 2 會列入 preserve preview');
assert.deepEqual(realSwissImpact.preview.lockedRoundIndexes, [1], 'Round 2 已有正式比分時會列為 LOCKED');

const repairedSwiss = repairMatchScore(swiss, 0, 0, ...repairedScores, '裁判確認第一輪比分輸入反向');
assert.notEqual(repairedSwiss.rounds[0].matches[0].winner, targetSwiss.winner, 'Swiss Repair 可修正歷史 winner');
assert.deepEqual(repairedSwiss.rounds[1], swissBeforeRepair.rounds[1], 'Swiss Repair 不改寫已開始 Round 2 的 pairing 或比分');
assert.equal(repairedSwiss.repairHistory.length, 1, 'Level 1 Repair 保存 audit history');
assert.equal(repairedSwiss.repairHistory[0].reason, '裁判確認第一輪比分輸入反向');
assert.deepEqual(repairedSwiss.repairHistory[0].lockedRoundIndexes, [1]);

const repairedStandings = getSwissPhaseStandings(repairedSwiss, 'preliminary');
const repairedTargetWinner = repairedSwiss.rounds[0].matches[0].winner;
assert.ok(repairedStandings.find((row) => row.player === repairedTargetWinner)?.wins >= 1, 'Repair 後 Swiss standings 使用新 winner 重算');

// Round 2 結束後，尚未產生的 Round 3 必須由 repaired state 產生，而不是回頭重排 Round 2。
const remainingRound2Index = repairedSwiss.rounds[1].matches.findIndex((match) => match.status === '可開始');
assert.notEqual(remainingRound2Index, -1);
const unrepairedNext = recordMatchResult(swissBeforeRepair, 1, remainingRound2Index, 4, 0, () => 0);
const repairedNext = recordMatchResult(repairedSwiss, 1, remainingRound2Index, 4, 0, () => 0);
assert.equal(repairedNext.rounds.length, 3, '修復後完成目前輪次仍正常產生下一輪');
assert.deepEqual(pairingList(repairedNext.rounds[1]), pairingList(repairedSwiss.rounds[1]), '完成目前輪次不會回頭改寫已保留的 Round 2 pairing');
assert.notDeepEqual(
  pairingList(repairedNext.rounds[2]),
  pairingList(unrepairedNext.rounds[2]),
  '下一個尚未產生 Round 會使用 repaired standings 重新計算 pairing',
);

// 真實 Round Robin：修正歷史 winner 後保留已產生下一輪。
let roundRobin = startTournament(checkInAll(createTournament('Round Robin Repair', ['R1', 'R2', 'R3', 'R4'], 'round_robin')));
roundRobin = completeRound(roundRobin, 0, [[4, 1], [4, 2]]);
assert.equal(roundRobin.rounds.length, 2, '完成循環賽第一輪後已產生下一輪');
const rrRound2Before = structuredClone(roundRobin.rounds[1]);
const rrTarget = roundRobin.rounds[0].matches[0];
const rrScores = rrTarget.winner === rrTarget.playerA ? [1, 4] : [4, 1];
const rrImpact = analyzeMatchScoreCorrection(roundRobin, 0, 0, ...rrScores);
assert.equal(rrImpact.level, 1);
assert.equal(rrImpact.repairable, true);
const repairedRoundRobin = applyTournamentAction(roundRobin, 'repair_match_score', {
  roundIndex: 0,
  matchIndex: 0,
  scoreA: rrScores[0],
  scoreB: rrScores[1],
  reason: '確認第一輪勝負輸入反向',
});
assert.notEqual(repairedRoundRobin.rounds[0].matches[0].winner, rrTarget.winner, 'Worker 可執行 Round Robin Level 1 repair');
assert.deepEqual(repairedRoundRobin.rounds[1], rrRound2Before, 'Round Robin 已產生 pairing 完整保留');
assert.equal(repairedRoundRobin.repairHistory.length, 1);

const auditView = scheduleView([repairedSwiss], repairedSwiss.id, true);
assert.match(auditView, /比分修正紀錄/, '管理者可查看 Repair audit history');
assert.match(auditView, /裁判確認第一輪比分輸入反向/);
const publicAuditView = scheduleView([repairedSwiss], repairedSwiss.id, false);
assert.doesNotMatch(publicAuditView, /比分修正紀錄/, '公開頁不顯示管理用 Repair audit history');

const normalizedOldV2 = normalizeTournament({ ...swissRankingChange, repairHistory: undefined });
assert.deepEqual(normalizedOldV2.repairHistory, [], '既有 V2 tournament 不需要 migration 即可補上空 repairHistory');

console.log('PASS score correction and Level 1 Repair Flow');

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
      phase: format === 'round_robin' ? 'round_robin' : 'preliminary',
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

function completeRound(tournament, roundIndex, scores) {
  let current = tournament;
  for (let matchIndex = 0; matchIndex < current.rounds[roundIndex].matches.length; matchIndex += 1) {
    if (current.rounds[roundIndex].matches[matchIndex].status !== '可開始') continue;
    const [scoreA, scoreB] = scores[matchIndex] || [4, 0];
    current = recordMatchResult(current, roundIndex, matchIndex, scoreA, scoreB, () => 0);
  }
  return current;
}

function pairingList(round) {
  return round.matches.map((match) => [match.playerA, match.playerB]);
}

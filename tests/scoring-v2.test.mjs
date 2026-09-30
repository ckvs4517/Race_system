import assert from 'node:assert/strict';
import {
  SCORING_METHODS,
  addScoringEvent,
  calculateScore,
  createAdjustmentScoringEvents,
  removeScoringEvent,
  replaceScoringEvent,
  scoringEventLabel,
  undoScoringEvent,
  validateScoringEvents,
} from '../src/domain/scoring.js';
import {
  createTournament,
  recordMatchResult,
  resetCompletedMatch,
  setDraftPlayerCheckedIn,
  startTournament,
} from '../src/domain/tournament.js';
import { applyTournamentAction } from '../worker/services/tournament-actions.js';

assert.deepEqual(
  SCORING_METHODS.map(({ type, points }) => [type, points]),
  [['spin', 1], ['over', 2], ['burst', 2], ['extreme', 3]],
  'Scoring V2 uses spin +1, over +2, burst +2, extreme +3',
);

let events = [];
events = addScoringEvent(events, 'A', 'spin');
events = addScoringEvent(events, 'B', 'burst');
events = addScoringEvent(events, 'A', 'extreme');
assert.deepEqual(calculateScore(events, 'A', 'B'), { scoreA: 4, scoreB: 2 }, 'events derive the official score');
assert.equal(scoringEventLabel(events[2]), '極限');
assert.equal(events[2].points, 3, 'event stores the actual points used at scoring time');

const undone = undoScoringEvent(events);
assert.deepEqual(calculateScore(undone, 'A', 'B'), { scoreA: 1, scoreB: 2 }, 'undo removes one complete scoring event');

const adjusted = addScoringEvent(undone, 'A', 'adjustment', 3);
assert.deepEqual(calculateScore(adjusted, 'A', 'B'), { scoreA: 4, scoreB: 2 }, 'manual adjustment remains an explicit event');
assert.equal(scoringEventLabel(adjusted.at(-1)), '手動調整');

const changedEvent = replaceScoringEvent(events, 0, 'B', 'over');
assert.deepEqual(calculateScore(changedEvent, 'A', 'B'), { scoreA: 3, scoreB: 4 }, '任一得分紀錄可變更得分方與勝利方式');
assert.equal(changedEvent[0].type, 'over');

const removedEvent = removeScoringEvent(events, 1);
assert.deepEqual(calculateScore(removedEvent, 'A', 'B'), { scoreA: 4, scoreB: 0 }, '任一指定得分紀錄可撤銷，不限最後一局');
assert.equal(removedEvent.length, 2);

assert.deepEqual(validateScoringEvents(events, 'A', 'B', 4, 2), { scoreA: 4, scoreB: 2 });
assert.throws(
  () => validateScoringEvents(events, 'A', 'B', 5, 2),
  /加總與正式比分不一致/,
  'server-side validation rejects a score that does not equal event totals',
);
assert.throws(
  () => validateScoringEvents([{ player: 'A', type: 'extreme', points: 2 }], 'A', 'B', 2, 0),
  /勝利方式與分數不一致/,
  'current input cannot lie about a victory method point value',
);

const aggregateAdjustmentEvents = createAdjustmentScoringEvents('A', 'B', 4, 2);
assert.deepEqual(calculateScore(aggregateAdjustmentEvents, 'A', 'B'), { scoreA: 4, scoreB: 2 }, 'aggregate adjustment helper remains valid for explicit manual adjustment use cases');

let tournament = createTournament('Scoring V2', ['A', 'B'], 'single_elimination');
tournament = setDraftPlayerCheckedIn(tournament, 'A', true);
tournament = setDraftPlayerCheckedIn(tournament, 'B', true);
tournament = startTournament(tournament);
const match = tournament.rounds[0].matches[0];
const canonicalEvents = [
  { player: match.playerA, type: 'spin', points: 1 },
  { player: match.playerA, type: 'extreme', points: 3 },
  { player: match.playerB, type: 'burst', points: 2 },
];

const completed = recordMatchResult(tournament, 0, 0, 4, 2, { scoringEvents: canonicalEvents });
const saved = completed.rounds[0].matches[0];
assert.equal(saved.scoringVersion, 2);
assert.deepEqual(saved.scoringEvents, canonicalEvents, 'formal match persists the complete event history');
assert.equal(saved.scoreA, 4);
assert.equal(saved.scoreB, 2);

assert.throws(
  () => recordMatchResult(tournament, 0, 0, 4, 1, { scoringEvents: canonicalEvents }),
  /加總與正式比分不一致/,
  'domain rejects tampered event totals before format progression',
);

const workerCompleted = applyTournamentAction(tournament, 'record_match', {
  roundIndex: 0,
  matchIndex: 0,
  scoreA: 4,
  scoreB: 2,
  scoringEvents: canonicalEvents,
});
assert.equal(workerCompleted.rounds[0].matches[0].scoringVersion, 2, 'Worker action revalidates and saves Scoring V2 events');


let quickTournament = createTournament('Quick Score source', ['Q1', 'Q2'], 'single_elimination');
quickTournament = setDraftPlayerCheckedIn(quickTournament, 'Q1', true);
quickTournament = setDraftPlayerCheckedIn(quickTournament, 'Q2', true);
quickTournament = startTournament(quickTournament);
const quickCompleted = applyTournamentAction(quickTournament, 'record_match', {
  roundIndex: 0,
  matchIndex: 0,
  scoreA: 4,
  scoreB: 2,
  scoringSource: 'quick_score',
});
const quickSaved = quickCompleted.rounds[0].matches[0];
assert.equal(quickSaved.scoreA, 4);
assert.equal(quickSaved.scoreB, 2);
assert.equal(quickSaved.scoringSource, 'quick_score', 'Worker/domain persist explicit Quick Score source');
assert.equal('scoringVersion' in quickSaved, false, 'Quick Score does not claim Scoring V2 event history');
assert.equal('scoringEvents' in quickSaved, false, 'Quick Score does not fabricate scoring events');
assert.throws(
  () => applyTournamentAction(quickTournament, 'record_match', {
    roundIndex: 0,
    matchIndex: 0,
    scoreA: 4,
    scoreB: 2,
    scoringSource: 'made_up_source',
  }),
  /不支援的記分來源/,
  'Worker/domain reject unknown scoring source',
);
assert.throws(
  () => applyTournamentAction(quickTournament, 'record_match', {
    roundIndex: 0,
    matchIndex: 0,
    scoreA: 4,
    scoreB: 2,
    scoringSource: 'quick_score',
    scoringEvents: createAdjustmentScoringEvents('Q1', 'Q2', 4, 2),
  }),
  /快速登分不能同時偽造逐局得分事件/,
  'Quick Score source cannot be combined with fake scoring events',
);
const replayedQuick = resetCompletedMatch(quickCompleted, 0, 0);
assert.equal('scoringSource' in replayedQuick.rounds[0].matches[0], false, 'Replay clears Quick Score source metadata');

console.log('PASS Scoring V2 domain and Worker validation');

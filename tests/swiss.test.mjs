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
  startTournament,
  updateDraftTournament,
  withdrawPlayer,
} from '../src/domain/tournament.js';
import { manageView } from '../src/views/manage.js';
import { scheduleView } from '../src/views/schedule.js';

const players = Array.from({ length: 8 }, (_, index) => `選手 ${index + 1}`);
let tournament = createTournament('八人瑞士賽', players, 'swiss');

assert.equal(tournament.format, 'swiss');
assert.equal(tournament.totalRounds, 3);
assert.equal(requiredSeedCount(tournament), 0);
assert.equal(tournament.rounds.length, 1);
assert.equal(tournament.rounds[0].matches.length, 4);
assert.equal(buildRounds(tournament).length, 1, '瑞士制不應投影尚未配對的輪次');

tournament = randomizeDraftTournament(tournament, () => 0);
assert.equal(new Set(tournament.players).size, players.length);
tournament = startTournament(tournament);
assert.match(scheduleView([tournament], tournament.id, true), /瑞士制/);
assert.match(scheduleView([tournament], tournament.id, true), /LIVE STANDINGS/);

while (tournament.status === '進行中') {
  const roundIndex = tournament.rounds.length - 1;
  const matchIds = tournament.rounds[roundIndex].matches.filter((match) => match.status === '可開始').map((match) => match.id);
  for (const [index, matchId] of matchIds.entries()) {
    const matchIndex = tournament.rounds[roundIndex].matches.findIndex((match) => match.id === matchId);
    tournament = recordMatchResult(tournament, roundIndex, matchIndex, 10, index);
  }
}

assert.equal(tournament.status, '已完成');
assert.equal(tournament.rounds.length, 3);
assert.ok(tournament.champion);
assert.equal(getTournamentStandings(tournament)[0].player, tournament.champion);
assertNoRepeatedPairings(tournament.rounds);
const completedView = scheduleView([tournament], tournament.id, true);
assert.match(completedView, /勝者組/);
assert.match(completedView, /敗者組/);
assert.match(completedView, /2 勝組/);
assert.match(completedView, /swiss-score-group/);

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
assert.equal(changed.totalRounds, 2);
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
  const roundIndex = result.rounds.length - 1;
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

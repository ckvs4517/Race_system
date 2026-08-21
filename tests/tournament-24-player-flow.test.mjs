/** 24 人正式賽事壓力流程：完整跑過報到、四輪瑞士制、前四單淘汰與每場賽後賽程 render。 */
import assert from 'node:assert/strict';
import {
  confirmTournamentSchedule,
  createTournament,
  getTournamentStandings,
  prepareTournamentSchedule,
  randomizeTournamentSchedule,
  recordMatchResult,
  setDraftPlayerCheckedIn,
  startSwissFinal,
} from '../src/domain/tournament.js';
import { scheduleView } from '../src/views/schedule.js';

const players = Array.from({ length: 24 }, (_, index) => `24P 選手 ${String(index + 1).padStart(2, '0')}`);
let tournament = createTournament('24 人賽前完整假賽', players, 'swiss', 3);
for (const player of players) tournament = setDraftPlayerCheckedIn(tournament, player, true);

tournament = prepareTournamentSchedule(tournament);
tournament = randomizeTournamentSchedule(tournament, () => 0);
tournament = confirmTournamentSchedule(tournament);

assert.equal(tournament.status, '進行中');
assert.equal(tournament.swissStage, 'preliminary');
assert.equal(tournament.rounds[0].matches.length, 12, '24 人每輪應有 12 場對戰');
assert.match(scheduleView([tournament], tournament.id, true), /24 位參賽/);

let scoreSubmissions = 0;
let scheduleRenders = 1;
while (tournament.swissStage === 'preliminary') {
  tournament = finishCurrentRoundAndRender(tournament);
}

assert.equal(tournament.swissStage, 'qualification');
assert.equal(tournament.rounds.filter((round) => (round.phase || 'preliminary') === 'preliminary').length, 4, '完整完成四輪瑞士預賽');
assert.equal(scoreSubmissions, 48, '四輪瑞士制共提交 48 場比分');
assertNoRepeatedPairings(tournament.rounds.filter((round) => (round.phase || 'preliminary') === 'preliminary'));

const standings = getTournamentStandings(tournament);
assert.equal(standings.length, 24, '四輪後保留 24 位完整排行榜');
const finalists = standings.slice(0, 4).map((row) => row.player);
tournament = startSwissFinal(tournament, finalists, 'single_elimination');
assert.equal(tournament.swissStage, 'final');

while (tournament.swissStage === 'final') {
  tournament = finishCurrentRoundAndRender(tournament);
}

assert.equal(tournament.status, '已完成');
assert.equal(tournament.swissStage, 'completed');
assert.ok(finalists.includes(tournament.champion), '冠軍必須來自四強名單');
assert.equal(scoreSubmissions, 52, '完整流程共提交 52 場正式比分');

const completedView = scheduleView([tournament], tournament.id, true);
scheduleRenders += 1;
assert.match(completedView, /CHAMPION|冠軍/);
assert.match(completedView, /player-history/);
assert.match(completedView, /階段成績/);

console.log(`PASS 24-player full tournament flow: ${scoreSubmissions} score submissions, ${scheduleRenders} schedule renders`);

function finishCurrentRoundAndRender(source) {
  let result = source;
  const roundIndex = result.rounds.findIndex((round) => round.matches.some((match) => match.status === '可開始'));
  assert.ok(roundIndex >= 0, '目前階段應存在可開始的對戰');
  const matchIds = result.rounds[roundIndex].matches.filter((match) => match.status === '可開始').map((match) => match.id);
  for (const id of matchIds) {
    const matchIndex = result.rounds[roundIndex].matches.findIndex((match) => match.id === id);
    result = recordMatchResult(result, roundIndex, matchIndex, 4, 0);
    scoreSubmissions += 1;
    const html = scheduleView([result], result.id, true);
    scheduleRenders += 1;
    assert.ok(html.length > 1000, '每次提交比分後賽程頁都能完整產生');
  }
  return result;
}

function assertNoRepeatedPairings(rounds) {
  const seen = new Set();
  for (const round of rounds) {
    for (const match of round.matches) {
      if (match.playerB === '輪空') continue;
      const key = [match.playerA, match.playerB].sort().join('|');
      assert.ok(!seen.has(key), `瑞士制不應重複配對：${key}`);
      seen.add(key);
    }
  }
}

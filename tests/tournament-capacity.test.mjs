/** 大型賽事上限：單淘汰／瑞士制支援 48 人，小型賽制仍維持 8 人。 */
import assert from 'node:assert/strict';
import {
  MAX_TOURNAMENT_PLAYERS,
  confirmTournamentSchedule,
  createTournament,
  prepareTournamentSchedule,
  randomizeTournamentSchedule,
  recordMatchResult,
  setDraftPlayerCheckedIn,
} from '../src/domain/tournament.js';

const players = Array.from({ length: MAX_TOURNAMENT_PLAYERS }, (_, index) => `P${index + 1}`);

let single = checkInAll(createTournament('48 人單淘汰', players, 'single_elimination'));
single = confirmTournamentSchedule(randomizeTournamentSchedule(prepareTournamentSchedule(single), () => 0));
assert.equal(single.rounds[0].matches.length, MAX_TOURNAMENT_PLAYERS / 2, '48 人單淘汰首輪產生 24 場');
while (single.status === '進行中') single = finishCurrentRound(single);
assert.equal(single.status, '已完成', '48 人單淘汰可以一路完成到冠軍');
assert.ok(single.champion, '48 人單淘汰會產生冠軍');

let swiss = checkInAll(createTournament('48 人瑞士制', players, 'swiss'));
swiss = confirmTournamentSchedule(randomizeTournamentSchedule(prepareTournamentSchedule(swiss), () => 0));
assert.equal(swiss.rounds[0].matches.length, MAX_TOURNAMENT_PLAYERS / 2, '48 人瑞士制首輪產生 24 場');
while (swiss.swissStage === 'preliminary') swiss = finishCurrentRound(swiss);
assert.equal(swiss.swissStage, 'qualification', '48 人瑞士制可以完成四輪預賽並進入結算階段');
assert.equal(swiss.rounds.length, 4, '48 人瑞士制完整產生四輪預賽');
assertNoRepeatedPairings(swiss.rounds);

const overLimit = [...players, 'P49'];
assert.throws(() => createTournament('49 人超額賽事', overLimit, 'swiss'), /48 位/, '第 49 位選手會被共用上限拒絕');

for (const format of ['round_robin', 'win_streak']) {
  const smallPlayers = Array.from({ length: 9 }, (_, index) => `${format}-${index + 1}`);
  const draft = checkInAll(createTournament('小型賽制上限', smallPlayers, format));
  assert.throws(() => prepareTournamentSchedule(draft), /3 至 8 位/, `${format} 仍維持 8 人上限`);
}

const registrationDraft = createTournament('報名上限', [], 'swiss');
assert.equal(registrationDraft.registrationSettings.capacity, MAX_TOURNAMENT_PLAYERS, '新賽事預設報名名額沿用共用上限');

console.log('PASS tournament capacity');

function checkInAll(tournament) {
  let current = tournament;
  for (const player of current.players) current = setDraftPlayerCheckedIn(current, player, true);
  return current;
}

function finishCurrentRound(source) {
  let result = source;
  const roundIndex = result.rounds.findIndex((round) => round.matches.some((match) => match.status === '可開始'));
  assert.notEqual(roundIndex, -1, '進行中的大型賽事應有可記分輪次');
  const matchIds = result.rounds[roundIndex].matches.filter((match) => match.status === '可開始').map((match) => match.id);
  for (const id of matchIds) {
    const matchIndex = result.rounds[roundIndex].matches.findIndex((match) => match.id === id);
    result = recordMatchResult(result, roundIndex, matchIndex, 4, 0, () => 0);
  }
  return result;
}

function assertNoRepeatedPairings(rounds) {
  const seen = new Set();
  for (const round of rounds) {
    for (const match of round.matches) {
      if (match.playerB === '輪空') continue;
      const key = [match.playerA, match.playerB].sort().join('|');
      assert.equal(seen.has(key), false, `48 人瑞士制不應重複配對：${key}`);
      seen.add(key);
    }
  }
}

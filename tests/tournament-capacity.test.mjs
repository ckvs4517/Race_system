/** 大型賽事上限：單淘汰／瑞士制支援 48 人，小型賽制仍維持 8 人。 */
import assert from 'node:assert/strict';
import {
  MAX_TOURNAMENT_PLAYERS,
  createTournament,
  prepareTournamentSchedule,
  randomizeTournamentSchedule,
  setDraftPlayerCheckedIn,
} from '../src/domain/tournament.js';

const players = Array.from({ length: MAX_TOURNAMENT_PLAYERS }, (_, index) => `P${index + 1}`);

let single = checkInAll(createTournament('48 人單淘汰', players, 'single_elimination'));
single = randomizeTournamentSchedule(prepareTournamentSchedule(single), () => 0);
assert.equal(single.rounds[0].matches.length, MAX_TOURNAMENT_PLAYERS / 2, '48 人單淘汰首輪產生 24 場');

let swiss = checkInAll(createTournament('48 人瑞士制', players, 'swiss'));
swiss = randomizeTournamentSchedule(prepareTournamentSchedule(swiss), () => 0);
assert.equal(swiss.rounds[0].matches.length, MAX_TOURNAMENT_PLAYERS / 2, '48 人瑞士制首輪產生 24 場');

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

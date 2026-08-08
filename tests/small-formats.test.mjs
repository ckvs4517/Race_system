import assert from 'node:assert/strict';
import {
  createTournament,
  getTournamentStandings,
  recordMatchResult,
  setDraftPlayerCheckedIn,
  startRoundRobinTieBreak,
  startTournament,
} from '../src/domain/tournament.js';

function checkInAll(tournament) {
  return tournament.players.reduce((current, player) => setDraftPlayerCheckedIn(current, player, true), tournament);
}

let roundRobinTournament = startTournament(checkInAll(createTournament('四人循環', ['A', 'B', 'C', 'D'], 'round_robin')));
assert.equal(roundRobinTournament.rounds.length, 1);
while (roundRobinTournament.status === '進行中') {
  const roundIndex = roundRobinTournament.rounds.findIndex((round) => round.matches.some((match) => match.status === '可開始'));
  assert.ok(roundIndex >= 0, '循環賽進行中必須有目前輪次');
  const matches = roundRobinTournament.rounds[roundIndex].matches.filter((match) => match.status === '可開始');
  for (const match of matches) {
    const matchIndex = roundRobinTournament.rounds[roundIndex].matches.findIndex((candidate) => candidate.id === match.id);
    const winner = [match.playerA, match.playerB].includes('C') ? 'C' : match.playerA;
    roundRobinTournament = recordMatchResult(roundRobinTournament, roundIndex, matchIndex, match.playerA === winner ? 4 : 0, match.playerB === winner ? 4 : 0);
  }
}
assert.equal(roundRobinTournament.status, '已完成');
assert.equal(roundRobinTournament.rounds.length, 3, '四人循環賽共三輪');
assert.equal(new Set(roundRobinTournament.rounds.flatMap((round) => round.matches.map((match) => [match.playerA, match.playerB].sort().join(':')))).size, 6, '每一對選手只交手一次');

let tiedTournament = startTournament(checkInAll(createTournament('三人同分', ['A', 'B', 'C'], 'round_robin')));
// A 勝 B、B 勝 C、C 勝 A，且每場勝方皆得到相同總分，形成並列第一。
while (tiedTournament.rounds.some((round) => round.matches.some((match) => match.status === '可開始'))) {
  const roundIndex = tiedTournament.rounds.findIndex((round) => round.matches.some((match) => match.status === '可開始'));
  const matchIndex = tiedTournament.rounds[roundIndex].matches.findIndex((match) => match.status === '可開始');
  const match = tiedTournament.rounds[roundIndex].matches[matchIndex];
  const winner = ({ 'A:B': 'A', 'A:C': 'C', 'B:C': 'B' })[[match.playerA, match.playerB].sort().join(':')];
  tiedTournament = recordMatchResult(tiedTournament, roundIndex, matchIndex, match.playerA === winner ? 4 : 0, match.playerB === winner ? 4 : 0);
}
assert.equal(tiedTournament.roundRobinStage, 'tied');
assert.equal(tiedTournament.status, '進行中');
assert.equal(getTournamentStandings(tiedTournament)[0].rank, getTournamentStandings(tiedTournament)[1].rank, '同勝場與總得分顯示並列名次');
tiedTournament = startRoundRobinTieBreak(tiedTournament, getTournamentStandings(tiedTournament).filter((row) => row.rank === 1).map((row) => row.player));
assert.equal(tiedTournament.rounds.at(-1).phase, 'tie_break');

let streakTournament = startTournament(checkInAll(createTournament('三人守擂', ['A', 'B', 'C'], 'win_streak')));
const streakWinner = streakTournament.rounds[0].matches[0].playerA;
streakTournament = recordMatchResult(streakTournament, 0, 0, 4, 0);
assert.equal(streakTournament.status, '進行中');
assert.equal(streakTournament.rounds.at(-1).matches[0].playerA, streakWinner, '勝者繼續守擂');
streakTournament = recordMatchResult(streakTournament, 1, 0, 4, 1);
assert.equal(streakTournament.status, '已完成');
assert.equal(streakTournament.champion, streakWinner);

assert.throws(() => startTournament(checkInAll(createTournament('循環賽人數不足', ['A', 'B'], 'round_robin'))), /3 至 8/);
assert.throws(() => startTournament(checkInAll(createTournament('連勝制人數過多', Array.from({ length: 9 }, (_, index) => `P${index}`), 'win_streak'))), /3 至 8/);
console.log('PASS small formats');

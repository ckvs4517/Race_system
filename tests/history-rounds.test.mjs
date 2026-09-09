/** 回歸：已產生 Round 常駐可查，完成輪收合，手機以單欄 accordion 顯示。 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildRounds, createTournament } from '../src/domain/tournament.js';
import { generatedRoundEntries } from '../src/views/schedule/rounds.js';
import { scheduleView } from '../src/views/schedule.js';

function activeParticipants(players) {
  return Object.fromEntries(players.map((player) => [player, { checkedIn: true, status: 'active' }]));
}

function completedMatch(id, playerA, playerB, scoreA = 4, scoreB = 2) {
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

const swissPlayers = ['A', 'B', 'C', 'D'];
const preliminaryRounds = Array.from({ length: 4 }, (_, index) => ({
  name: `瑞士制第 ${index + 1} 輪`,
  phase: 'preliminary',
  phaseRound: index + 1,
  seriesId: 'preliminary',
  matches: [
    completedMatch(`r${index + 1}m1`, 'A', 'B', 4, index % 2 ? 1 : 2),
    completedMatch(`r${index + 1}m2`, 'C', 'D', 4, index % 2 ? 2 : 1),
  ],
}));

const qualification = {
  ...createTournament('歷史 Round 測試', swissPlayers, 'swiss'),
  status: '進行中',
  swissStage: 'qualification',
  participantStates: activeParticipants(swissPlayers),
  rounds: preliminaryRounds,
};
const qualificationView = scheduleView([qualification], qualification.id, true);
const qualificationRoundColumns = qualificationView.match(/<details class="(?:round-history )?round-column/g) || [];
assert.equal(qualificationRoundColumns.length, 4, 'Swiss qualification 仍顯示四輪已產生預賽');
assert.equal((qualificationView.match(/class="round-history round-column is-completed/g) || []).length, 3, '較早完成 Round 標記為歷史 accordion');
assert.match(qualificationView, /ROUND 01/);
assert.match(qualificationView, /ROUND 04/);
assert.doesNotMatch(qualificationView, /round-history round-column is-completed[^>]*\sopen/, '歷史完成 Round 預設收合');
assert.doesNotMatch(qualificationView, /bracket-pending/, 'qualification 不再把歷史賽程區隱藏');

const activeSecondRound = {
  ...qualification,
  swissStage: 'preliminary',
  rounds: [
    preliminaryRounds[0],
    {
      name: '瑞士制第 2 輪',
      phase: 'preliminary',
      phaseRound: 2,
      seriesId: 'preliminary',
      matches: [
        { id: 'active-r2m1', playerA: 'A', playerB: 'C', scoreA: null, scoreB: null, winner: null, status: '可開始' },
        { id: 'active-r2m2', playerA: 'B', playerB: 'D', scoreA: null, scoreB: null, winner: null, status: '可開始' },
      ],
    },
  ],
};
const activeView = scheduleView([activeSecondRound], activeSecondRound.id, true);
assert.match(activeView, /class="round-history round-column is-completed/, '上一輪保留並標記為歷史');
assert.match(activeView, /<details class="round-column[^>]*\sopen>/, '目前未完成 Round 預設展開');
assert.match(activeView, /目前輪次預設展開；已完成輪次可展開追查歷史對戰/);

const eliminationPlayers = Array.from({ length: 8 }, (_, index) => `E${index + 1}`);
const elimination = {
  ...createTournament('淘汰賽歷史 Round', eliminationPlayers, 'single_elimination'),
  status: '進行中',
  bracketVersion: 2,
  participantStates: activeParticipants(eliminationPlayers),
  rounds: [{
    name: '八強賽',
    matches: [
      { id: 'e1', playerA: 'E1', playerB: 'E2', scoreA: null, scoreB: null, winner: null, status: '可開始' },
      { id: 'e2', playerA: 'E3', playerB: 'E4', scoreA: null, scoreB: null, winner: null, status: '可開始' },
      { id: 'e3', playerA: 'E5', playerB: 'E6', scoreA: null, scoreB: null, winner: null, status: '可開始' },
      { id: 'e4', playerA: 'E7', playerB: 'E8', scoreA: null, scoreB: null, winner: null, status: '可開始' },
    ],
  }],
};
const projectedEliminationRounds = buildRounds(elimination);
assert.ok(projectedEliminationRounds.length > elimination.rounds.length, '淘汰賽 buildRounds 仍可產生未來預覽 Round');
const storedEntries = generatedRoundEntries(elimination, projectedEliminationRounds);
assert.equal(storedEntries.length, elimination.rounds.length, '正式歷史只包含實際 stored/generated rounds');
assert.ok(storedEntries.every(({ round }) => !round.projected), 'projected future round 不混入歷史 Round');

const responsiveCss = await readFile(new URL('../src/styles/features/schedule-responsive.css', import.meta.url), 'utf8');
assert.match(responsiveCss, /\.bracket-flow \{ min-width: 0; width: 100%; display: grid; grid-template-columns: minmax\(0, 1fr\);/, '手機歷史 Round 改成單欄 grid');
assert.match(responsiveCss, /\.round-column\.is-completed:not\(\[open\]\)\.has-battle-stations \{ width: 100%; min-width: 0;/, '手機收合 Round 不保留橫向固定寬度');
assert.match(responsiveCss, /\.battle-stations \{ grid-template-columns: minmax\(0, 1fr\); \}/, '手機展開多戰鬥台時也改為單欄');

console.log('PASS persistent historical rounds');

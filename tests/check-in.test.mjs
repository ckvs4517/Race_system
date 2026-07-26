import assert from 'node:assert/strict';
import {
  addDraftPlayer,
  confirmTournamentSchedule,
  createTournament,
  prepareTournamentSchedule,
  randomizeTournamentSchedule,
  removeDraftPlayer,
  setDraftPlayerCheckedIn,
  startTournament,
  updateRegistrationSettings,
} from '../src/domain/tournament.js';
import { scheduleView } from '../src/views/schedule.js';

let tournament = createTournament('報到流程測試', ['甲', '乙', '丙', '丁'], 'swiss');
assert.equal(tournament.rounds.length, 0);
assert.ok(tournament.players.every((player) => tournament.participantStates[player].checkedIn === false));
assert.throws(() => startTournament(tournament), /2 至 32/);

let view = scheduleView([tournament], tournament.id, true);
assert.match(view, /參賽選手名單/);
assert.match(view, /已報到 0／報名 4 人/);
assert.match(view, /data-add-draft-player-form/);
assert.match(view, /data-enter-remove-mode/);
assert.match(view, /data-remove-player-select="甲"/);
assert.doesNotMatch(view, /data-remove-draft-player/, '一般報到畫面不顯示單列移除按鈕');
assert.match(view, /data-roster-search/);
assert.match(view, /data-roster-filter="unchecked"/);
assert.match(view, /建立公開報名連結/);
assert.match(view, /data-action="prepare-tournament-schedule" disabled/);
assert.match(view, /完成報到後再產生賽程/);
assert.doesNotMatch(view, /data-action="randomize-schedule"/);

const registrationOpen = updateRegistrationSettings(tournament, { enabled: true });
view = scheduleView([registrationOpen], registrationOpen.id, true);
assert.match(view, /公開報名中/);
assert.match(view, /data-share-registration/);
assert.match(view, /data-manage-registration/);

tournament = addDraftPlayer(tournament, '現場選手');
assert.equal(tournament.players.length, 5);
assert.equal(tournament.participantStates['現場選手'].checkedIn, false);
assert.throws(() => addDraftPlayer(tournament, '現場選手'), /不可重複/);
tournament = removeDraftPlayer(tournament, '現場選手');
assert.equal(tournament.players.length, 4);
assert.equal(tournament.participantStates['現場選手'], undefined);

for (const player of ['甲', '乙', '丙', '丁']) tournament = setDraftPlayerCheckedIn(tournament, player, true);
tournament = addDraftPlayer(tournament, '未到選手');
view = scheduleView([tournament], tournament.id, true);
assert.match(view, /已報到 4／報名 5 人/);
assert.doesNotMatch(view.match(/data-action="prepare-tournament-schedule"[^>]*>/)?.[0] || '', /disabled/);

let scheduling = prepareTournamentSchedule(tournament);
assert.equal(scheduling.status, '排程中');
assert.equal(scheduling.rounds.length, 0, '確認報到後仍等待主辦方按下隨機分組');
view = scheduleView([scheduling], scheduling.id, true);
assert.match(view, /data-action="randomize-schedule"/);
scheduling = randomizeTournamentSchedule(scheduling, () => 0);
assert.equal(scheduling.rounds.length, 1);
assert.match(scheduleView([scheduling], scheduling.id, true), /data-opening-pairings-form/);
const confirmed = confirmTournamentSchedule(scheduling);
assert.equal(confirmed.status, '進行中');

const started = startTournament(tournament);
assert.equal(started.status, '進行中');
assert.equal(started.players.length, 5, '未到選手仍保留在完整報名名單');
assert.equal(started.participantStates['未到選手'].status, 'no_show');
assert.ok(started.rounds.every((round) => round.matches.every((match) => ![match.playerA, match.playerB].includes('未到選手'))));
assert.equal(started.rounds[0].matches.length, 2, '只有四位已報到選手進入首輪');
assert.throws(() => addDraftPlayer(started, '太晚加入'), /開始後/);
assert.throws(() => setDraftPlayerCheckedIn(started, '甲', false), /開始後/);

console.log('PASS check-in flow');

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MAX_TOURNAMENT_PLAYERS,
  addDraftPlayer,
  confirmTournamentSchedule,
  createTournament,
  prepareTournamentSchedule,
  randomizeTournamentSchedule,
  removeDraftPlayer,
  setDraftPlayerCheckedIn,
  setAllDraftPlayersCheckedIn,
  startTournament,
  updateRegistrationSettings,
  updateDraftParticipant,
} from '../src/domain/tournament.js';
import { scheduleView } from '../src/views/schedule.js';

let tournament = createTournament('報到流程測試', ['甲', '乙', '丙', '丁'], 'swiss');
assert.equal(tournament.rounds.length, 0);
assert.ok(tournament.players.every((player) => tournament.participantStates[player].checkedIn === false));
assert.throws(() => startTournament(tournament), new RegExp(`2 至 ${MAX_TOURNAMENT_PLAYERS}`));

let view = scheduleView([tournament], tournament.id, true);
assert.match(view, /參賽選手名單/);
assert.match(view, /已報到 0／報名 4 人/);
assert.match(view, /data-add-draft-player-form/);
assert.match(view, /data-enter-remove-mode/);
assert.match(view, /data-check-in-all/, '報到工具提供一鍵全部報到');
assert.match(view, /data-check-in-summary/, '報到摘要可局部更新而不必重畫整頁');
assert.match(view, /data-remove-player-select="甲"/);
assert.doesNotMatch(view, /data-remove-draft-player/, '一般報到畫面不顯示單列移除按鈕');
assert.match(view, /data-roster-search/);
assert.match(view, /data-roster-filter="unchecked"/);
assert.match(view, /建立私密填寫連結/);
assert.match(view, new RegExp(`max=\"${MAX_TOURNAMENT_PLAYERS}\"`), '賽事頁快速報名設定沿用共用人數上限');
assert.match(view, /飲品統計/);
assert.match(view, /data-edit-player="甲"/);
assert.match(view, /data-action="prepare-tournament-schedule" disabled/);
assert.match(view, /完成報到後再產生賽程/);
assert.doesNotMatch(view, /data-action="randomize-schedule"/);

const registrationOpen = updateRegistrationSettings(tournament, { enabled: true });
view = scheduleView([registrationOpen], registrationOpen.id, true);
assert.match(view, /參賽資料填寫連結已啟用/);
assert.match(view, /data-share-registration/);
assert.match(view, /data-manage-registration/);

tournament = addDraftPlayer(tournament, '現場選手', {
  phone: '0912345678',
  drink: { itemId: 'juice' },
});
assert.equal(tournament.players.length, 5);
assert.equal(tournament.participantStates['現場選手'].checkedIn, false);
assert.equal(tournament.participantDetails['現場選手'].drink.displayName, '果汁(無咖啡因)');
tournament = updateDraftParticipant(tournament, '現場選手', '現場選手（已確認）', { phone: '0987654321' });
assert.equal(tournament.participantDetails['現場選手（已確認）'].drink.displayName, '果汁(無咖啡因)', '編輯聯絡資料時保留原飲品');
assert.throws(() => addDraftPlayer(tournament, '現場選手（已確認）'), /不可重複/);
tournament = removeDraftPlayer(tournament, '現場選手（已確認）');
assert.equal(tournament.players.length, 4);
assert.equal(tournament.participantStates['現場選手'], undefined);

tournament = setAllDraftPlayersCheckedIn(tournament);
assert.ok(tournament.players.every((player) => tournament.participantStates[player].checkedIn), '一鍵報到會將草稿名單全部標為已報到');
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
assert.throws(() => setAllDraftPlayersCheckedIn(started), /開始後/);

const storeSource = readFileSync(new URL('../src/data/store.js', import.meta.url), 'utf8');
const checkInSource = readFileSync(new URL('../src/features/schedule/check-in.js', import.meta.url), 'utf8');
assert.match(storeSource, /EXPLICIT_RENDER_ACTIONS[^;]*set_check_in/s, '單人報到成功不觸發整個 schedule 頁重畫');
assert.match(checkInSource, /checkInSaveQueue/, '快速連續報到會在 schedule feature 序列化送出，避免 revision 衝突');

console.log('PASS check-in flow');

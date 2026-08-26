/** 回歸：提前結束後，未進行場次只能保留查看，不能再進入正式記分。 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  completeTournamentEarly,
  createTournament,
  recordMatchResult,
  setDraftPlayerCheckedIn,
  startTournament,
} from '../src/domain/tournament.js';
import { scheduleView } from '../src/views/schedule.js';

function checkInAll(tournament) {
  return tournament.players.reduce((current, player) => setDraftPlayerCheckedIn(current, player, true), tournament);
}

let tournament = startTournament(checkInAll(createTournament('提前結束鎖定測試', ['A', 'B', 'C', 'D'])));
tournament = recordMatchResult(tournament, 0, 0, 4, 1, () => 0);
const pendingMatchIndex = tournament.rounds[0].matches.findIndex((match) => match.status === '可開始');
assert.notEqual(pendingMatchIndex, -1, '提前結束前仍有尚未進行的場次');

const ended = completeTournamentEarly(tournament);
assert.equal(ended.status, '已完成', '提前結束會將賽事標記為已完成');
assert.equal(ended.rounds[0].matches[pendingMatchIndex].status, '可開始', '不改寫既有歷史排程資料');

const endedView = scheduleView([ended], ended.id, true);
assert.match(endedView, /未進行（賽事已結束）/, '已提前結束的未賽場次明確標示為未進行');
assert.ok(!endedView.includes('class="match-card is-ready"'), '已提前結束的未賽場次不再產生可點擊記分按鈕');
assert.match(endedView, /data-replay-round="0"/, '已完成的既有對戰仍保留重新比賽入口');
assert.throws(
  () => recordMatchResult(ended, 0, pendingMatchIndex, 4, 0),
  /賽事尚未開始或已經完成/,
  '領域層持續拒絕對已完成賽事寫入新比分',
);

const mainSource = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
const scheduleControllerSource = await readFile(new URL('../src/features/schedule/controller.js', import.meta.url), 'utf8');
assert.match(mainSource, /tournament\.status === '進行中' && match\?\.status === '可開始'/, '路由只在進行中且可開始時顯示正式記分板');
assert.match(scheduleControllerSource, /tournament\.status !== '進行中' \|\| match\.status !== '可開始'/, '同步後若賽事已結束會清除舊的記分選取狀態');

console.log('PASS early finish locks unfinished matches');

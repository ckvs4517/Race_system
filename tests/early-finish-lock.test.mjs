/** 回歸：提前結束後，未進行場次與後續階段操作都必須鎖定。 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  completeSwissByStandings,
  completeTournamentEarly,
  createTournament,
  recordMatchResult,
  setDraftPlayerCheckedIn,
  startSwissFinal,
  startSwissQualifier,
  startTournament,
} from '../src/domain/tournament.js';
import { scheduleView } from '../src/views/schedule.js';

function checkInAll(tournament) {
  return tournament.players.reduce((current, player) => setDraftPlayerCheckedIn(current, player, true), tournament);
}

function finishCurrentSwissRound(tournament) {
  const roundIndex = tournament.rounds.findIndex((round) => round.matches.some((match) => match.status === '可開始'));
  assert.notEqual(roundIndex, -1, '瑞士輪應有可進行的目前輪次');
  let current = tournament;
  for (let matchIndex = 0; matchIndex < current.rounds[roundIndex].matches.length; matchIndex += 1) {
    if (current.rounds[roundIndex].matches[matchIndex].status !== '可開始') continue;
    current = recordMatchResult(current, roundIndex, matchIndex, 4, 0, () => 0);
  }
  return current;
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

let swiss = startTournament(checkInAll(createTournament('瑞士制提前結束鎖定測試', ['A', 'B', 'C', 'D'], 'swiss')));
let safety = 0;
while (swiss.swissStage === 'preliminary') {
  assert.ok(safety++ < 5, '瑞士制應在四輪後進入 qualification');
  swiss = finishCurrentSwissRound(swiss);
}
assert.equal(swiss.swissStage, 'qualification', '完整第一階段後會進入第二階段確認狀態');
assert.match(scheduleView([swiss], swiss.id, true), /data-swiss-final-form/, '正常進行中的 qualification 仍可建立第二階段');

const endedSwiss = completeTournamentEarly(swiss);
assert.equal(endedSwiss.status, '已完成', 'qualification 狀態也可選擇提前結束整場賽事');
assert.equal(endedSwiss.swissStage, 'qualification', '提前結束不需要改寫既有 Swiss 階段歷史欄位');
const endedSwissView = scheduleView([endedSwiss], endedSwiss.id, true);
assert.doesNotMatch(endedSwissView, /data-swiss-final-form/, '提前結束後不再顯示第二階段建立表單');
assert.doesNotMatch(endedSwissView, /data-swiss-qualifier-form/, '提前結束後不再顯示資格加賽表單');
assert.match(endedSwissView, /賽事已提前結束/, '提前結束後的階段提示不再誤導為等待建立第二階段');
assert.throws(
  () => startSwissFinal(endedSwiss, endedSwiss.players, 'round_robin'),
  /賽事已結束，不能再建立第二階段/,
  '領域層拒絕對已提前結束賽事建立第二階段',
);
assert.throws(
  () => startSwissQualifier(endedSwiss, endedSwiss.players.slice(0, 2)),
  /賽事已結束，不能再建立資格加賽/,
  '領域層拒絕對已提前結束賽事建立資格加賽',
);
assert.throws(
  () => completeSwissByStandings(endedSwiss),
  /賽事已結束，不能再以積分榜結算/,
  '領域層拒絕對已提前結束賽事再次結算',
);

const mainSource = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
const scheduleControllerSource = await readFile(new URL('../src/features/schedule/controller.js', import.meta.url), 'utf8');
assert.match(mainSource, /tournament\.status === '進行中' && match\?\.status === '可開始'/, '路由只在進行中且可開始時顯示正式記分板');
assert.match(scheduleControllerSource, /tournament\.status !== '進行中' \|\| match\.status !== '可開始'/, '同步後若賽事已結束會清除舊的記分選取狀態');

console.log('PASS early finish locks unfinished matches and Swiss stage transitions');

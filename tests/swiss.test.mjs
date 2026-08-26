/** 瑞士制專項測試：配對、輪空、分組、排名、退賽與多戰鬥台。 */
import assert from 'node:assert/strict';
import {
  buildRounds,
  completeSwissByStandings,
  createTournament,
  forfeitMatch,
  getTournamentStandings,
  getSwissPhaseStandings,
  randomizeDraftTournament,
  recordMatchResult,
  requiredSeedCount,
  resetCompletedMatch,
  setDraftPlayerCheckedIn,
  startSwissFinal,
  startSwissQualifier,
  startTournament,
  updateDraftTournament,
  withdrawPlayer,
} from '../src/domain/tournament.js';
import { manageView } from '../src/views/manage.js';
import { scheduleView } from '../src/views/schedule.js';

const players = Array.from({ length: 8 }, (_, index) => `選手 ${index + 1}`);
let tournament = createTournament('八人瑞士賽', players, 'swiss');

assert.equal(tournament.format, 'swiss');
assert.equal(tournament.totalRounds, 4);
assert.equal(requiredSeedCount(tournament), 0);
assert.equal(tournament.rounds.length, 0);
assert.match(scheduleView([tournament], tournament.id, true), /參賽選手名單/);
assert.match(scheduleView([tournament], tournament.id, true), /已報到 0／報名 8 人/);
tournament = checkInAll(tournament);
assert.equal(tournament.rounds.length, 0);
assert.equal(buildRounds(tournament).length, 0, '瑞士制報到階段不應提前配對');

tournament = randomizeDraftTournament(tournament, () => 0);
assert.equal(new Set(tournament.players).size, players.length);
tournament = startTournament(tournament);
assert.equal(tournament.rounds[0].matches.length, 4);
assert.match(scheduleView([tournament], tournament.id, true), /瑞士制/);
assert.match(scheduleView([tournament], tournament.id, true), /LIVE STANDINGS/);

const rankingProbe = {
  ...createTournament('同戰績排序', ['高分選手', '低分選手', '全勝選手', '未勝選手'], 'swiss'),
  status: '進行中',
  swissStage: 'qualification',
  rounds: [
    {
      name: '測試第一輪',
      phase: 'preliminary',
      matches: [
        completedMatch('probe-1', '全勝選手', '高分選手', 5, 3),
        completedMatch('probe-2', '低分選手', '未勝選手', 4, 0),
      ],
    },
    {
      name: '測試第二輪',
      phase: 'preliminary',
      matches: [
        completedMatch('probe-3', '全勝選手', '低分選手', 4, 1),
        completedMatch('probe-4', '高分選手', '未勝選手', 4, 0),
      ],
    },
  ],
};
const rankingProbeRows = getTournamentStandings(rankingProbe);
assert.deepEqual(rankingProbeRows.map((row) => row.player), ['全勝選手', '高分選手', '低分選手', '未勝選手']);
assert.deepEqual(rankingProbeRows.map((row) => row.rank), [1, 2, 3, 4], '勝敗相同時以總得分拆分名次');
const clearTopFourView = scheduleView([rankingProbe], rankingProbe.id, true);
assert.doesNotMatch(clearTopFourView, /data-swiss-qualifier-form/, '四強資格明確時不顯示資格積分決定賽');
assert.match(clearTopFourView, /data-complete-swiss-standings/);
assert.match(clearTopFourView, /value="single_elimination"/);
const standingsCompleted = completeSwissByStandings(rankingProbe);
assert.equal(standingsCompleted.status, '已完成');
assert.equal(standingsCompleted.swissStage, 'completed');
assert.equal(standingsCompleted.swissFinalMode, 'standings');
assert.equal(standingsCompleted.rounds.length, rankingProbe.rounds.length);

const tiedCutoffProbe = {
  ...createTournament('同分四強資格', ['甲', '乙', '丙', '丁', '戊'], 'swiss'),
  status: '進行中',
  swissStage: 'qualification',
};
const tiedCutoffView = scheduleView([tiedCutoffProbe], tiedCutoffProbe.id, true);
assert.match(tiedCutoffView, /data-swiss-qualifier-form/, '前四資格線同分超過四人時顯示資格積分決定賽');
const tiedStandingsCompleted = completeSwissByStandings(tiedCutoffProbe);
assert.equal(tiedStandingsCompleted.champion, null, '積分榜第一名同分時不應任意指定冠軍');

const attendanceRankingProbe = {
  ...createTournament('報到排序', ['實際參賽 0-4', '未報到高分', '其他甲', '其他乙', '其他丙'], 'swiss'),
  status: '進行中',
  swissStage: 'preliminary',
  participantStates: {
    '實際參賽 0-4': { checkedIn: true, status: 'active' },
    '未報到高分': { checkedIn: false, status: 'no_show' },
    '其他甲': { checkedIn: true, status: 'active' },
    '其他乙': { checkedIn: true, status: 'active' },
    '其他丙': { checkedIn: true, status: 'active' },
  },
  rounds: [{
    name: '瑞士制第 1 輪',
    phase: 'preliminary',
    matches: [
      completedMatch('attendance-1', '實際參賽 0-4', '其他甲', 0, 4),
      completedMatch('attendance-2', '未報到高分', '其他乙', 4, 0),
    ],
  }],
};
const attendanceRankingRows = getTournamentStandings(attendanceRankingProbe);
assert.equal(attendanceRankingRows.at(-1).player, '未報到高分', '瑞士排行榜將未報到高分選手排在所有已報到選手後面');

while (tournament.swissStage === 'preliminary') tournament = finishCurrentRound(tournament);
assert.equal(tournament.status, '進行中');
assert.equal(tournament.swissStage, 'qualification');
assert.equal(tournament.rounds.length, 4);
assert.equal(tournament.champion, null);
assertNoRepeatedPairings(tournament.rounds);
const qualificationView = scheduleView([tournament], tournament.id, true);
assert.match(qualificationView, /瑞士輪結算方式/);

const preliminary = getTournamentStandings(tournament);
assert.ok(preliminary.every((row) => Number.isInteger(row.totalPoints)), '排行榜列出總得分');
assertBuchholzOrder(preliminary);
const initialFinalForm = qualificationView.match(/<form data-swiss-final-form>[\s\S]*?<\/form>/)?.[0] || '';
assert.equal((initialFinalForm.match(/name="finalist"/g) || []).length, 4, '直接確認四強只列排行榜前四名');
assert.ok(preliminary.slice(0, 4).every((row) => initialFinalForm.includes(row.player)), '直接四強包含排行榜前四名');
const qualifierPlayers = preliminary.slice(2, 6).map((row) => row.player);
tournament = startSwissQualifier(tournament, qualifierPlayers);
assert.equal(tournament.swissStage, 'qualifier');
while (tournament.swissStage === 'qualifier') tournament = finishCurrentRound(tournament);
assert.equal(tournament.swissStage, 'qualification');
const postQualifierView = scheduleView([tournament], tournament.id, true);
const postQualifierFinalForm = postQualifierView.match(/<form data-swiss-final-form>[\s\S]*?<\/form>/)?.[0] || '';
assert.equal((postQualifierFinalForm.match(/name="finalist"/g) || []).length, 4, '資格加賽後仍只列四位確定晉級者');

const finalists = preliminary.slice(0, 4).map((row) => row.player);
let knockout = startSwissFinal({ ...tournament, arenaCount: 2 }, finalists, 'single_elimination');
assert.equal(knockout.swissFinalMode, 'single_elimination');
assert.equal(knockout.rounds.at(-1).matches[0].playerA, finalists[0]);
assert.equal(knockout.rounds.at(-1).matches[0].playerB, finalists[3]);
assert.equal(knockout.rounds.at(-1).matches[1].playerA, finalists[1]);
assert.equal(knockout.rounds.at(-1).matches[1].playerB, finalists[2]);
while (knockout.swissStage === 'final') knockout = finishCurrentRound(knockout);
assert.equal(knockout.status, '已完成');
assert.equal(knockout.champion, finalists[0]);
assert.deepEqual(getTournamentStandings(knockout).slice(0, 4).map((row) => row.player), [finalists[0], finalists[1], finalists[3], finalists[2]]);

tournament = { ...tournament, arenaCount: 2 };
tournament = startSwissFinal(tournament, finalists);
assert.equal(tournament.swissStage, 'final');
const finalView = scheduleView([tournament], tournament.id, true);
assert.match(finalView, /1 台戰鬥台/, '四強頁面標示單一戰鬥台');
assert.doesNotMatch(finalView, /戰鬥台 2|battle-stations/, '四強循環決賽固定使用一台戰鬥台');
while (tournament.swissStage === 'final') tournament = finishCurrentRound(tournament);
assert.equal(tournament.status, '已完成');
assert.equal(tournament.swissStage, 'completed');
assert.ok(tournament.champion);
assert.equal(getTournamentStandings(tournament)[0].player, tournament.champion);
const completedView = scheduleView([tournament], tournament.id, true);
assert.match(completedView, /TOP 4 FINAL/);
assert.match(completedView, /下載戰績圖/);
assert.equal((completedView.match(/<details class="round-column/g) || []).length, 1, '賽程區只保留最後一個輪次，避免手機橫向滑動歷史輪次');
assert.match(completedView, /player-history/, '歷史對戰改由排行榜展開查看');
assert.match(completedView, /ROUND 01/, '排行榜保留前面輪次的對戰紀錄');
assert.match(completedView, /round-column is-completed/);
assert.doesNotMatch(completedView, /round-column is-completed[^>]*\sopen/);

const reset = resetCompletedMatch(tournament, 0, 0);
assert.equal(reset.status, '進行中');
assert.equal(reset.rounds.length, 1);
assert.equal(reset.rounds[0].matches[0].status, '可開始');

let odd = startTournament(checkInAll(createTournament('五人瑞士賽', ['A', 'B', 'C', 'D', 'E'], 'swiss')));
const firstBye = odd.rounds[0].seedPlayer;
assert.ok(firstBye);
assert.equal(odd.playerStats[firstBye].wins, 1, '輪空應計為一勝');
odd = finishCurrentRound(odd);
assert.notEqual(odd.rounds[1].seedPlayer, firstBye, '有其他選擇時不可連續輪空');

let swissWithdrawal = startTournament(checkInAll(createTournament('瑞士退賽測試', ['W1', 'W2', 'W3', 'W4'], 'swiss')));
const withdrawalMatch = swissWithdrawal.rounds[0].matches[0];
swissWithdrawal = withdrawPlayer(swissWithdrawal, withdrawalMatch.playerA);
assert.equal(swissWithdrawal.rounds[0].matches[0].outcome, 'withdrawal');
const remainingMatchIndex = swissWithdrawal.rounds[0].matches.findIndex((match) => match.status === '可開始');
swissWithdrawal = forfeitMatch(swissWithdrawal, 0, remainingMatchIndex, swissWithdrawal.rounds[0].matches[remainingMatchIndex].playerB);
assert.ok(!swissWithdrawal.rounds[1].matches.some((match) => [match.playerA, match.playerB].includes(withdrawalMatch.playerA)), '退賽選手不進入瑞士制後續配對');

let changed = createTournament('切換賽制', ['A', 'B', 'C', 'D']);
changed = updateDraftTournament(changed, changed.name, changed.players, 'swiss');
assert.equal(changed.format, 'swiss');
assert.equal(changed.totalRounds, 4);
assert.match(manageView(changed), /option value="swiss" selected/);
assert.match(manageView(), /瑞士制/);
assert.match(manageView(), /name="arenaCount"/);
assert.match(manageView(), /name="swissAdvanceCount"/);
assert.doesNotMatch(manageView(), /name="swissStage2Format"/, '建立賽事時不應先選第二階段賽制');
assert.doesNotMatch(manageView(), /name="swissStage2Rounds"/, '建立賽事時不應先選第二階段瑞士輪輪數');

const top8Players = Array.from({ length: 12 }, (_, index) => `Top8-${index + 1}`);
let top8Stage = {
  ...createTournament('48人流程縮小驗證', top8Players, 'swiss', 2),
  swissStage2Config: { advanceCount: 8 },
};
top8Stage = startTournament(checkInAll(top8Stage));
while (top8Stage.swissStage === 'preliminary') top8Stage = finishCurrentRound(top8Stage);
assert.equal(top8Stage.swissStage, 'qualification');
const top8Rows = getTournamentStandings(top8Stage);
const top8Finalists = top8Rows.slice(0, 8).map((row) => row.player);
const top8QualificationView = scheduleView([top8Stage], top8Stage.id, true);
assert.match(top8QualificationView, /確認 Top 8 並建立第二階段/);
assert.match(top8QualificationView, /value="round_robin"/);
assert.match(top8QualificationView, /value="single_elimination"/);
assert.match(top8QualificationView, /value="swiss" checked/);
assert.match(top8QualificationView, /name="swissStage2Rounds"/);
top8Stage = startSwissFinal(top8Stage, top8Finalists, 'swiss', 4);
assert.equal(top8Stage.swissFinalMode, 'swiss', '第二階段應使用第一階段完成後選定的瑞士輪');
assert.deepEqual(top8Stage.swissStage2Config, { advanceCount: 8, format: 'swiss', rounds: 4 });
assert.equal(top8Stage.finalists.length, 8);
assert.equal(top8Stage.rounds.at(-1).matches.length, 4);
const top8LiveView = scheduleView([top8Stage], top8Stage.id, true);
assert.match(top8LiveView, /第一階段止步選手（4）/);
assert.match(top8LiveView, /查看排名、完整戰績與戰績圖/);
assert.match(top8LiveView, /data-download-share-card=/, '第二階段進行中，未晉級選手仍可下載戰績圖');
assert.ok(getSwissPhaseStandings(top8Stage, 'final').every((row) => row.wins === 0 && row.totalPoints === 0), '第二階段統計應從零開始');
while (top8Stage.swissStage === 'final') top8Stage = finishCurrentRound(top8Stage);
assert.equal(top8Stage.status, '已完成');
assert.equal(top8Stage.swissStage, 'completed');
assert.equal(top8Stage.rounds.filter((round) => round.seriesId === 'stage2-swiss').length, 4);
assert.equal(top8Stage.swissFinalTopTwo.length, 2);
assert.equal(top8Stage.champion, top8Stage.swissFinalTopTwo[0]);
assertNoRepeatedPairings(top8Stage.rounds.filter((round) => round.seriesId === 'stage2-swiss'));
const top8CompletedView = scheduleView([top8Stage], top8Stage.id, true);
assert.match(top8CompletedView, /STAGE 2/);
assert.match(top8CompletedView, /第二階段瑞士輪第一名/);

const tenWayTiePlayers = Array.from({ length: 10 }, (_, index) => `同分-${index + 1}`);
const top8TieProbe = {
  ...createTournament('Top8切線同分', tenWayTiePlayers, 'swiss'),
  status: '進行中',
  swissStage: 'qualification',
  swissStage2Config: { advanceCount: 8 },
};
const top8TieView = scheduleView([top8TieProbe], top8TieProbe.id, true);
const top8QualifierForm = top8TieView.match(/<form data-swiss-qualifier-form>[\s\S]*?<\/form>/)?.[0] || '';
assert.equal((top8QualifierForm.match(/name="candidate"/g) || []).length, 10, 'Top8 切線同分時應只建立切線同分群組且不可受舊 6 人上限限制');
const top8Qualifier = startSwissQualifier(top8TieProbe, tenWayTiePlayers);
assert.equal(top8Qualifier.swissStage, 'qualifier');
assert.equal(top8Qualifier.swissQualifierSlots, 8);
assert.equal(top8Qualifier.rounds.filter((round) => round.phase === 'qualifier').length, 9);

let top8Knockout = {
  ...createTournament('Top8單淘汰第二階段', top8Players, 'swiss'),
  status: '進行中',
  swissStage: 'qualification',
  swissStage2Config: { advanceCount: 8 },
};
top8Knockout = startSwissFinal(top8Knockout, top8Players.slice(0, 8), 'single_elimination');
assert.equal(top8Knockout.swissFinalMode, 'single_elimination');
assert.equal(top8Knockout.swissStage2Config.format, 'single_elimination');
assert.equal(top8Knockout.rounds.at(-1).matches.length, 4);
while (top8Knockout.swissStage === 'final') top8Knockout = finishCurrentRound(top8Knockout);
assert.equal(top8Knockout.status, '已完成');
assert.equal(getTournamentStandings(top8Knockout).filter((row) => top8Knockout.finalists.includes(row.player)).length, 8, 'Top8 單淘汰完成後八位晉級者都要保留在排行榜');

const top4ChoiceProbe = {
  ...createTournament('Top4第二階段選擇', players.slice(0, 4), 'swiss'),
  status: '進行中',
  swissStage: 'qualification',
  swissStage2Config: { advanceCount: 4 },
};
const top4ChoiceView = scheduleView([top4ChoiceProbe], top4ChoiceProbe.id, true);
assert.match(top4ChoiceView, /value="round_robin" checked/);
assert.match(top4ChoiceView, /value="single_elimination"/);
assert.doesNotMatch(top4ChoiceView, /value="swiss"/, 'Top4 第二階段不可選瑞士輪');

let top8RoundRobin = {
  ...createTournament('Top8循環第二階段', top8Players, 'swiss'),
  status: '進行中',
  swissStage: 'qualification',
  swissStage2Config: { advanceCount: 8 },
};
top8RoundRobin = startSwissFinal(top8RoundRobin, top8Players.slice(0, 8), 'round_robin');
assert.equal(top8RoundRobin.swissFinalMode, 'round_robin');
assert.equal(top8RoundRobin.rounds.filter((round) => round.phase === 'final').length, 7, 'Top8 循環應建立 7 輪');
assert.equal(top8RoundRobin.rounds.filter((round) => round.phase === 'final').flatMap((round) => round.matches).length, 28, 'Top8 循環應建立 28 場');
const top8TieBreakPreview = {
  ...top8RoundRobin,
  finalTie: true,
  rounds: [...top8RoundRobin.rounds, {
    name: 'Top 8 第二階段同分加賽 1－第 1 輪',
    phase: 'final',
    phaseRound: 1,
    seriesId: 'final-tiebreak-1',
    seriesPlayers: top8Players.slice(0, 2),
    matches: [{ id: 'preview-tie', playerA: top8Players[0], playerB: top8Players[1], scoreA: null, scoreB: null, winner: null, status: '可開始' }],
  }],
};
const top8TieBreakPreviewView = scheduleView([top8TieBreakPreview], top8TieBreakPreview.id, true);
assert.match(top8TieBreakPreviewView, /Top 8 第二階段同分加賽進行中/);
assert.match(top8TieBreakPreviewView, /AUTOMATIC TIE BREAK/);

const multiArena = startTournament(checkInAll(createTournament('雙台瑞士賽', players, 'swiss', 2)));
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
  const roundIndex = result.rounds.findIndex((round) => round.matches.some((match) => match.status === '可開始'));
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

function assertBuchholzOrder(rows) {
  rows.slice(1).forEach((row, index) => {
    const previous = rows[index];
    if (previous.wins !== row.wins) return;
    assert.ok(previous.opponentWins >= row.opponentWins, '勝場相同時對手勝場總和較高者排前面');
    if (previous.opponentWins === row.opponentWins) {
      assert.ok(previous.totalPoints >= row.totalPoints, '勝場與對手勝場相同時總得分較高者排前面');
    }
  });
}

function completedMatch(id, playerA, playerB, scoreA, scoreB) {
  return {
    id,
    playerA,
    playerB,
    scoreA,
    scoreB,
    winner: scoreA > scoreB ? playerA : playerB,
    status: '已完成',
  };
}

function checkInAll(tournament) {
  return tournament.players.reduce((current, player) => setDraftPlayerCheckedIn(current, player, true), tournament);
}

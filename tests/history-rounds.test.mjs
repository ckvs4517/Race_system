/** #55-1：歷史 Round 常駐顯示、完成輪收合、目前輪展開。 */
import assert from 'node:assert/strict';
import {
  buildRounds,
  createTournament,
  recordMatchResult,
  setDraftPlayerCheckedIn,
  startTournament,
} from '../src/domain/tournament.js';
import { scheduleView } from '../src/views/schedule.js';
import { readAppStyles } from './lib/style-source.mjs';

const swissPlayers = Array.from({ length: 8 }, (_, index) => `歷史-${index + 1}`);
let swiss = startTournament(checkInAll(createTournament('歷史輪次顯示', swissPlayers, 'swiss')));
swiss = finishCurrentRound(swiss);

const roundTwoView = scheduleView([swiss], swiss.id, true);
const roundTwoTags = roundDetails(roundTwoView);
assert.equal(roundTwoTags.length, swiss.rounds.length, '進入下一輪後應保留所有已產生 Swiss Round');
assert.match(roundTwoTags[0], /is-completed/, '上一輪應標記為已完成');
assert.ok(!roundTwoTags[0].includes(' open'), '已完成 Round 預設收合');
assert.match(roundTwoTags[1], /is-current/, '目前輪次應標記為 current');
assert.ok(roundTwoTags[1].includes(' open'), '目前 Round 預設展開');
assert.match(roundTwoView, /ROUND 01/);
assert.match(roundTwoView, /ROUND 02/);

while (swiss.swissStage === 'preliminary') swiss = finishCurrentRound(swiss);
assert.equal(swiss.swissStage, 'qualification');
const qualificationView = scheduleView([swiss], swiss.id, true);
const qualificationTags = roundDetails(qualificationView);
assert.equal(qualificationTags.length, 4, 'Swiss qualification 仍保留四輪第一階段歷史');
assert.ok(qualificationTags.every((tag) => !tag.includes(' open')), 'qualification 時所有已完成 preliminary Round 預設收合');

const knockoutPlayers = Array.from({ length: 8 }, (_, index) => `淘汰-${index + 1}`);
const knockout = startTournament(checkInAll(createTournament('單淘汰正式輪次', knockoutPlayers, 'single_elimination')));
const projectedKnockoutRounds = buildRounds(knockout);
assert.ok(projectedKnockoutRounds.length > knockout.rounds.length, '單淘汰 buildRounds 會包含純預覽 projected Round');
assert.ok(projectedKnockoutRounds.some((round) => round.projected), '測試資料需包含 projected future round');
const knockoutView = scheduleView([knockout], knockout.id, true);
assert.equal(roundDetails(knockoutView).length, knockout.rounds.length, '正式賽程頁不得把 projected future round 當成歷史 Round 顯示');

const css = await readAppStyles();
assert.match(
  css,
  /\.bracket-flow \{ min-width: 0; width: 100%; display: grid; grid-template-columns: minmax\(0, 1fr\); gap: 12px; \}/,
  '手機版歷史 Round 應改成單欄 accordion，而不是水平滑動多欄',
);
assert.match(
  css,
  /\.battle-stations \{ grid-template-columns: 1fr; \}/,
  '手機版多戰鬥台 Round 展開後也應維持單欄',
);

console.log('PASS historical rounds stay visible and collapse safely');

function roundDetails(html) {
  return [...html.matchAll(/<details class="round-column[^"]*"[^>]*>/g)].map((match) => match[0]);
}

function checkInAll(tournament) {
  return tournament.players.reduce((current, player) => setDraftPlayerCheckedIn(current, player, true), tournament);
}

function finishCurrentRound(source) {
  let result = source;
  const roundIndex = result.rounds.findIndex((round) => round.matches.some((match) => match.status === '可開始'));
  const matchIds = result.rounds[roundIndex].matches.filter((match) => match.status === '可開始').map((match) => match.id);
  matchIds.forEach((id, index) => {
    const matchIndex = result.rounds[roundIndex].matches.findIndex((match) => match.id === id);
    result = recordMatchResult(result, roundIndex, matchIndex, 4, index % 3);
  });
  return result;
}

/** 2～系統上限 × 單淘汰／瑞士制的完整賽程矩陣，確保每種人數都能產生冠軍。 */
import assert from 'node:assert/strict';
import {
  MAX_TOURNAMENT_PLAYERS,
  buildRounds,
  createTournament,
  drawRandomSeeds,
  getTournamentStandings,
  recordMatchResult,
  requiredSeedCount,
  setDraftPlayerCheckedIn,
  startSwissFinal,
  startTournament,
} from '../src/domain/tournament.js';
import { getTournamentFormat } from '../src/formats/registry.js';
import { leaderboardView } from '../src/views/schedule/leaderboard.js';

let completedTournaments = 0;
let completedMatches = 0;

for (const format of ['single_elimination', 'swiss']) {
  for (let playerCount = 2; playerCount <= MAX_TOURNAMENT_PLAYERS; playerCount += 1) {
    if (format === 'swiss' && playerCount < 4) continue;
    const players = Array.from({ length: playerCount }, (_, index) => `${format}-${playerCount}-${index + 1}`);
    let tournament = checkInAll(createTournament(`${playerCount} 人矩陣測試`, players, format, Math.min(8, Math.max(1, Math.ceil(playerCount / 4)))));

    assert.equal(new Set(tournament.players).size, playerCount, `${format} ${playerCount} 人名單完整`);
    assert.equal(requiredSeedCount(tournament), format === 'single_elimination' ? playerCount % 2 : 0);
    if (requiredSeedCount(tournament)) tournament = drawRandomSeeds(tournament, () => 0);
    tournament = startTournament(tournament);

    let safety = 0;
    while (tournament.status === '進行中') {
      assert.ok(safety++ < 200, `${format} ${playerCount} 人賽程必須可以結束`);
      if (format === 'swiss' && tournament.swissStage === 'qualification') {
        const finalists = getTournamentStandings(tournament).slice(0, Math.min(4, playerCount)).map((row) => row.player);
        tournament = startSwissFinal(tournament, finalists);
      }
      const roundIndex = tournament.rounds.findIndex((round) => round.matches.some((match) => match.status === '可開始'));
      const playableIds = tournament.rounds[roundIndex].matches
        .filter((match) => match.status === '可開始')
        .map((match) => match.id);
      assert.ok(playableIds.length > 0, `${format} ${playerCount} 人進行中必須有可計分對戰`);
      for (const [index, matchId] of playableIds.entries()) {
        const currentRoundIndex = tournament.rounds.findIndex((round) => round.matches.some((match) => match.id === matchId));
        const matchIndex = tournament.rounds[currentRoundIndex].matches.findIndex((match) => match.id === matchId);
        tournament = recordMatchResult(tournament, currentRoundIndex, matchIndex, 4 + (index % 3), index % 4, () => 0);
        completedMatches += 1;
      }
    }

    assert.equal(tournament.status, '已完成', `${format} ${playerCount} 人賽事完成`);
    assert.ok(players.includes(tournament.champion), `${format} ${playerCount} 人冠軍來自參賽名單`);
    const standings = getTournamentStandings(tournament);
    assert.equal(standings.length, playerCount, `${format} ${playerCount} 人排行榜人數正確`);
    assert.equal(standings[0].player, tournament.champion, `${format} ${playerCount} 人排行榜首位是冠軍`);
    assert.equal(standings[0].rank, 1, `${format} ${playerCount} 人冠軍排名第一`);
    assert.equal(standings.filter((row) => row.rank === 1).length, 1, `${format} ${playerCount} 人完成後不得保留並列冠軍`);
    assert.ok(standings.slice(1).every((row, index) => row.rank >= standings[index].rank), `${format} ${playerCount} 人名次不得逆序`);
    if (format === 'single_elimination') {
      assert.deepEqual(standings.map((row) => row.rank), Array.from({ length: playerCount }, (_, index) => index + 1), `${format} ${playerCount} 人淘汰賽名次連續`);
    }
    assert.ok(tournament.rounds.every((round) => round.matches.every((match) => match.status !== '可開始')), `${format} ${playerCount} 人完成後沒有未結算對戰`);
    if (format === 'single_elimination') {
      assert.equal(buildRounds(tournament).length, Math.ceil(Math.log2(playerCount)), `${playerCount} 人單淘汰輪數正確`);
    } else {
      assert.equal(tournament.rounds.filter((round) => (round.phase || 'preliminary') === 'preliminary').length, 4, `${playerCount} 人瑞士預賽固定四輪`);
    }
    completedTournaments += 1;
  }
}

assert.throws(() => startTournament(checkInAll(createTournament('人數不足', ['A']))), new RegExp(`2 至 ${MAX_TOURNAMENT_PLAYERS}`));
assert.throws(() => createTournament('人數超過', Array.from({ length: MAX_TOURNAMENT_PLAYERS + 1 }, (_, index) => `P${index}`)), new RegExp(`不可超過 ${MAX_TOURNAMENT_PLAYERS}`));
assert.throws(() => createTournament('重複名稱', ['A', 'A']), /不可重複/);
assert.throws(() => createTournament('台數不足', ['A', 'B'], 'single_elimination', 0), /1 至 8/);
assert.throws(() => createTournament('台數超過', ['A', 'B'], 'single_elimination', 9), /1 至 8/);

let validation = startTournament(checkInAll(createTournament('比分驗證', ['A', 'B'])));
assert.throws(() => recordMatchResult(validation, 0, 0, 1, 0), /至少為 4/);
assert.throws(() => recordMatchResult(validation, 0, 0, 4, 4), /比分相同/);
assert.throws(() => recordMatchResult(validation, 0, 0, -1, 4), /0 以上的整數/);
assert.throws(() => recordMatchResult(validation, 0, 0, 4.5, 1), /0 以上的整數/);

let singleEliminationLeaderboard = startTournament(checkInAll(createTournament('單淘汰排行榜標籤', ['A', 'B', 'C', 'D'], 'single_elimination')));
singleEliminationLeaderboard = recordMatchResult(singleEliminationLeaderboard, 0, 0, 4, 1, () => 0);
const singleEliminationLeaderboardHtml = leaderboardView(
  singleEliminationLeaderboard,
  getTournamentStandings(singleEliminationLeaderboard),
  false,
);
assert.match(singleEliminationLeaderboardHtml, /<b>單淘汰賽<\/b>/, '單淘汰排行榜階段成績應顯示單淘汰賽');
assert.doesNotMatch(singleEliminationLeaderboardHtml, /<b>瑞士輪<\/b>/, '單淘汰排行榜不得誤顯示瑞士輪');

let openingByeTournament = startTournament(checkInAll(createTournament('單淘汰第一輪輪空', ['A', 'B', 'C'], 'single_elimination')));
const openingByeMatch = openingByeTournament.rounds[0].matches.find((match) => match.status === '輪空晉級');
assert.ok(openingByeMatch?.winner, '三人單淘汰第一輪應有一名輪空者');
const openingByePlayer = openingByeMatch.winner;
const openingByeStanding = getTournamentStandings(openingByeTournament).find((row) => row.player === openingByePlayer);
assert.equal(openingByeStanding.wins, 1, '第一輪輪空應立即計入排行榜 1 勝');
assert.equal(openingByeStanding.losses, 0, '輪空不得增加敗場');
assert.equal(openingByeStanding.totalPoints, 0, '單淘汰輪空不得額外增加得分');
assert.equal(openingByeTournament.playerStats[openingByePlayer].wins, 1, 'stored stats 應記錄輪空勝場');
assert.equal(openingByeTournament.playerStats[openingByePlayer].matchesPlayed, 0, '輪空不算實際出賽');

const staleOpeningByeTournament = structuredClone(openingByeTournament);
staleOpeningByeTournament.playerStats[openingByePlayer].wins = 0;
assert.equal(
  getTournamentStandings(staleOpeningByeTournament).find((row) => row.player === openingByePlayer).wins,
  1,
  '舊 V2 stored stats 漏記輪空勝場時，排行榜應由 rounds 自動推導正確勝場',
);
const rebuiltOpeningByeStats = getTournamentFormat('single_elimination').rebuildStats(
  staleOpeningByeTournament.players,
  staleOpeningByeTournament.rounds,
);
assert.equal(rebuiltOpeningByeStats[openingByePlayer].wins, 1, 'rebuildStats 應把輪空重建為 1 勝');
assert.equal(rebuiltOpeningByeStats[openingByePlayer].byeCount, 1, 'rebuildStats 應保留輪空次數');
assert.equal(rebuiltOpeningByeStats[openingByePlayer].matchesPlayed, 0, 'rebuildStats 不得把輪空算成實際出賽');

let laterByeTournament = startTournament(checkInAll(createTournament('單淘汰後續輪空', ['A', 'B', 'C', 'D', 'E'], 'single_elimination')));
const firstRoundPlayableIds = laterByeTournament.rounds[0].matches
  .filter((match) => match.status === '可開始')
  .map((match) => match.id);
for (const matchId of firstRoundPlayableIds) {
  const roundIndex = laterByeTournament.rounds.findIndex((round) => round.matches.some((match) => match.id === matchId));
  const matchIndex = laterByeTournament.rounds[roundIndex].matches.findIndex((match) => match.id === matchId);
  laterByeTournament = recordMatchResult(laterByeTournament, roundIndex, matchIndex, 4, 1, () => 0);
}
const laterByeMatch = laterByeTournament.rounds[1].matches.find((match) => match.status === '輪空晉級');
assert.ok(laterByeMatch?.winner, '五人單淘汰完成第一輪後，三名晉級者應再產生一名輪空者');
const laterByePlayer = laterByeMatch.winner;
const expectedLaterByeWins = laterByeTournament.rounds
  .flatMap((round) => round.matches)
  .filter((match) => match.winner === laterByePlayer && ['已完成', '輪空晉級'].includes(match.status))
  .length;
assert.equal(laterByeTournament.playerStats[laterByePlayer].wins, expectedLaterByeWins, '後續輪次輪空也必須計入 stored wins');
assert.equal(getTournamentStandings(laterByeTournament).find((row) => row.player === laterByePlayer).wins, expectedLaterByeWins, '後續輪次輪空也必須計入排行榜勝場');

console.log(`PASS format matrix: ${completedTournaments} tournaments, ${completedMatches} matches`);

function checkInAll(tournament) {
  return tournament.players.reduce((current, player) => setDraftPlayerCheckedIn(current, player, true), tournament);
}

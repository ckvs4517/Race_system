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

console.log(`PASS format matrix: ${completedTournaments} tournaments, ${completedMatches} matches`);

function checkInAll(tournament) {
  return tournament.players.reduce((current, player) => setDraftPlayerCheckedIn(current, player, true), tournament);
}

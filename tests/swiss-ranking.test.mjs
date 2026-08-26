
import assert from 'node:assert/strict';
import {
  DEFAULT_SWISS_RANKING_RULE,
  SWISS_RANKING_RULE_BUCHHOLZ,
  SWISS_RANKING_RULE_LEGACY,
  calculateOpponentWins,
  rankSwissStandings,
} from '../src/domain/ranking/swiss-ranking.js';
import {
  createTournament,
  duplicateTournament,
  getSwissPhaseStandings,
  normalizeTournament,
  updateDraftTournament,
} from '../src/domain/tournament.js';
import { buildShareCardData } from '../src/domain/share-card.js';
import { ResultShareCard } from '../src/views/result-share-card.js';
import { shareCardAssets } from '../src/config/share-card-assets.js';
import { manageView } from '../src/views/manage.js';
import { scheduleView } from '../src/views/schedule.js';

function stats(values) {
  return Object.fromEntries(Object.entries(values).map(([player, value]) => [player, {
    wins: value.wins || 0,
    losses: value.losses || 0,
    pointsFor: value.points || 0,
    byeCount: value.byeCount || 0,
  }]));
}

function match(playerA, playerB, winner = null, scoreA = null, scoreB = null) {
  return {
    playerA,
    playerB,
    winner,
    scoreA,
    scoreB,
    status: playerB === '輪空' ? '輪空晉級' : winner ? '已完成' : '可開始',
  };
}

{
  const players = ['A', 'B', 'C', 'D'];
  const values = stats({ A: { wins: 4 }, B: { wins: 3 }, C: { wins: 2 }, D: { wins: 1 } });
  const rounds = [
    { matches: [match('A', 'B', 'A', 4, 2)] },
    { matches: [match('A', 'C', 'A', 4, 1)] },
    { matches: [match('A', 'D', 'A', 4, 0)] },
    { matches: [match('A', '輪空', 'A')] },
  ];
  const opponentWins = calculateOpponentWins({ players, stats: values, rounds, totalRounds: 4 });
  assert.equal(opponentWins.A, 8, '4 輪賽事的輪空應以 +2 Buchholz 計算');
}

{
  const players = ['A', 'B', 'C'];
  const values = stats({ A: { wins: 2, losses: 1, points: 10 }, B: { wins: 2, losses: 1, points: 10 }, C: { wins: 3, points: 12 } });
  const rounds = [
    { matches: [match('A', 'B', 'A', 4, 3)] },
    { matches: [match('A', 'C', 'C', 2, 4), match('B', 'C', 'C', 1, 4)] },
  ];
  const rows = rankSwissStandings({ players, stats: values, rounds, rule: SWISS_RANKING_RULE_BUCHHOLZ, totalRounds: 4 });
  const a = rows.find((row) => row.player === 'A');
  const b = rows.find((row) => row.player === 'B');
  assert.equal(a.opponentWins, b.opponentWins);
  assert.equal(a.rank + 1, b.rank, '兩人前三項完全同分且曾交手時，直接對戰勝者應排前');
  assert.equal(a.rankResolution?.criterion, 'head_to_head');
}

{
  const players = ['A', 'B', 'C'];
  const values = stats({ A: { wins: 2, losses: 1, points: 10 }, B: { wins: 2, losses: 1, points: 10 }, C: { wins: 2, losses: 1, points: 10 } });
  const rounds = [
    { matches: [match('A', 'B', 'A', 4, 3)] },
    { matches: [match('B', 'C', 'B', 4, 3)] },
    { matches: [match('C', 'A', 'C', 4, 3)] },
  ];
  const rows = rankSwissStandings({ players, stats: values, rounds, rule: SWISS_RANKING_RULE_BUCHHOLZ, totalRounds: 4 });
  assert.deepEqual(rows.map((row) => row.rank), [1, 1, 1], '三人以上完全同分不能用成對直接對戰硬拆名次');
  assert(rows.every((row) => row.rankResolution?.criterion === 'unresolved'));
}

{
  const players = ['A', 'B'];
  const values = stats({ A: { wins: 2, losses: 1, points: 8 }, B: { wins: 2, losses: 2, points: 20 } });
  const rows = rankSwissStandings({ players, stats: values, rule: SWISS_RANKING_RULE_LEGACY });
  assert.equal(rows[0].player, 'A', 'legacy_v1 必須保留舊版勝場、敗場、總得分排序');
}

{
  const created = createTournament('新規則', ['A', 'B', 'C', 'D'], 'swiss');
  assert.equal(created.swissRankingRule, DEFAULT_SWISS_RANKING_RULE);
  assert.equal(created.swissRankingRule, SWISS_RANKING_RULE_BUCHHOLZ);

  const storedOld = structuredClone(created);
  delete storedOld.swissRankingRule;
  const normalizedOld = normalizeTournament(storedOld);
  assert.equal(normalizedOld.swissRankingRule, SWISS_RANKING_RULE_LEGACY, '缺少欄位的歷史賽事必須維持舊排名');
  assert.equal(duplicateTournament(storedOld).swissRankingRule, SWISS_RANKING_RULE_LEGACY, '複製歷史賽事不得偷偷換排名規則');
  assert.equal(updateDraftTournament(storedOld, storedOld.name, storedOld.players, 'swiss').swissRankingRule, SWISS_RANKING_RULE_LEGACY, '編輯舊草稿不得偷偷換排名規則');

  const nonSwiss = createTournament('切換賽制', ['A', 'B', 'C', 'D'], 'single_elimination');
  assert.equal(updateDraftTournament(nonSwiss, nonSwiss.name, nonSwiss.players, 'swiss').swissRankingRule, SWISS_RANKING_RULE_BUCHHOLZ, '新切換成瑞士制時應使用新預設');
}

{
  const tournament = createTournament('UI 測試', ['A', 'B', 'C', 'D'], 'swiss');
  tournament.participantStates = Object.fromEntries(tournament.players.map((player) => [player, { status: 'active', checkedIn: true }]));
  tournament.status = '進行中';
  tournament.rounds = [{
    name: '瑞士制第 1 輪', phase: 'preliminary', seriesId: 'preliminary', phaseRound: 1,
    matches: [match('A', 'B', 'A', 4, 2), match('C', 'D', 'C', 4, 1)],
  }];
  const html = scheduleView([tournament], tournament.id, true);
  assert.match(html, /對手勝場/);
  assert.match(html, /輪空以該階段總輪數一半/);
  const form = manageView(null);
  assert.match(form, /對手強度排名（推薦）/);
  assert.match(form, /buchholz_v1/);

  const rows = getSwissPhaseStandings(tournament, 'preliminary');
  assert(rows.every((row) => typeof row.opponentWins === 'number'));
}

{
  const tournament = createTournament('戰績圖測試', ['A', 'B', 'C', 'D'], 'swiss');
  tournament.participantStates = Object.fromEntries(tournament.players.map((player) => [player, { status: 'active', checkedIn: true }]));
  tournament.status = '已完成';
  tournament.swissStage = 'completed';
  tournament.swissFinalMode = 'standings';
  tournament.rounds = [
    { name: '瑞士制第 1 輪', phase: 'preliminary', seriesId: 'preliminary', matches: [match('A', 'B', 'A', 4, 2), match('C', 'D', 'C', 4, 1)] },
    { name: '瑞士制第 2 輪', phase: 'preliminary', seriesId: 'preliminary', matches: [match('A', 'C', 'A', 4, 3), match('B', 'D', 'B', 4, 0)] },
  ];
  const data = buildShareCardData(tournament, 'A');
  assert.equal(typeof data.stageStats.find((stage) => stage.label === '瑞士輪')?.opponentWins, 'number');
  const html = ResultShareCard(data, {
    badge: shareCardAssets.badges.champion,
    showRankNumber: false,
    tag: shareCardAssets.tags.win,
    performanceLabel: '測試',
    leagueLogo: shareCardAssets.logos.league,
    venueLogo: shareCardAssets.logos.venue,
  });
  assert.match(html, /對手勝場/);
}

console.log('swiss ranking v1 tests passed');

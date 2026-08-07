import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { shareCardAssets } from '../src/config/share-card-assets.js';
import { buildShareCardData, resolveShareCardPresentation } from '../src/domain/share-card.js';
import { ResultShareCard } from '../src/views/result-share-card.js';

const players = ['冠軍', '亞軍', '第四名', '第七名', '第八名', '對手甲', '對手乙', '對手丙'];
const completed = (id, playerA, playerB, scoreA, scoreB) => ({ id, playerA, playerB, scoreA, scoreB, winner: scoreA > scoreB ? playerA : playerB, status: '已完成' });
const tournament = {
  id: 901,
  name: '這是一個很長很長的戰績分享圖測試賽事名稱，用來確認標題不會把模板撐破',
  format: 'swiss',
  status: '已完成',
  players,
  participantStates: Object.fromEntries(players.map((player) => [player, { checkedIn: true, status: 'active' }])),
  eventInfo: { date: '2026/08/07', venueName: '' },
  swissStage: 'completed',
  rounds: [
    { name: '瑞士制第 1 輪', phase: 'preliminary', matches: [completed('r1', '冠軍', '對手甲', 4, 2)] },
    { name: '資格積分決定賽', phase: 'qualifier', matches: [completed('q1', '冠軍', '對手乙', 4, 3)] },
    { name: '四強循環第 1 輪', phase: 'final', matches: [completed('f1', '冠軍', '對手丙', 4, 1)] },
    { name: '淘汰賽決賽', phase: 'elimination', matches: [completed('e1', '冠軍', '亞軍', 4, 0)] },
    { name: '輪空不列入正式對戰', phase: 'preliminary', matches: [{ id: 'bye', playerA: '冠軍', playerB: '輪空', scoreA: 4, scoreB: 0, winner: '冠軍', status: '輪空晉級' }] },
  ],
};

const data = buildShareCardData(tournament, '冠軍');
assert.equal(data.wins, 4, '總勝敗必須包含預賽、資格、四強循環與淘汰賽');
assert.equal(data.losses, 0);
assert.equal(data.totalScore, 16);
assert.equal(data.winRate, 100);
assert.deepEqual(data.matches.map((match) => match.phase), ['瑞士制第 1 輪', '資格積分決定賽', '四強循環決賽', '淘汰賽決賽'], '對戰紀錄依實際輪次排序');

const expectedBadges = { 1: shareCardAssets.badges.champion, 2: shareCardAssets.badges.top4, 4: shareCardAssets.badges.top4, 7: shareCardAssets.badges.top8, 8: shareCardAssets.badges.top8 };
for (const [rank, badge] of Object.entries(expectedBadges)) {
  const rankData = { ...data, rank: Number(rank), playerName: `非常長的選手名稱-${rank}-用來測試單一模板是否穩定顯示` };
  const presentation = resolveShareCardPresentation(rankData, shareCardAssets);
  const html = ResultShareCard(rankData, presentation);
  assert.equal(presentation.badge, badge, `${rank} 名應使用對應 badge`);
  assert.match(html, /data-result-share-card/, `${rank} 名共用同一模板`);
  assert.match(html, /share-history/, `${rank} 名保有相同對戰區塊`);
  assert.match(html, /share-stats/, `${rank} 名保有相同統計區塊`);
}

const fallbackHtml = ResultShareCard({ ...data, venueName: '', tournamentName: '' }, resolveShareCardPresentation(data, shareCardAssets));
assert.match(fallbackHtml, /88coffee&amp;tattoo|88coffee&tattoo/, '店家欄位缺失時使用文字 fallback');
assert.match(fallbackHtml, /SPIN LEAGUE/, 'Logo 缺失時保留文字 fallback');
for (const asset of [shareCardAssets.backgrounds.texture, shareCardAssets.badges.champion, shareCardAssets.stats.record, shareCardAssets.logos.league]) {
  assert.ok(existsSync(fileURLToPath(asset)), `素材存在：${asset}`);
}

console.log('share-card.test.mjs passed');

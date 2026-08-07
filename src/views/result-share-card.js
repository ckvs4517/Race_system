import { shareCardAssets } from '../config/share-card-assets.js';

/**
 * 產生所有名次共用的 1080 × 1350 HTML/CSS 分享圖模板。
 * 模板不重新計算戰績，避免不同匯出入口出現統計差異。
 *
 * @param {object} data 由 buildShareCardData 產生的資料。
 * @param {object} presentation 由 resolveShareCardPresentation 產生的顯示規則。
 * @returns {string} 可交給 DOM-to-image 匯出的 HTML。
 */
export function ResultShareCard(data, presentation) {
  const records = data.matches.slice(0, 10).map((match) => `<li><img src="${shareCardAssets.tags[match.result]}" alt="${match.result}" data-share-optional><span>${escapeText(match.phase)} · ${escapeText(match.opponent)}</span><b>${match.scoreFor} : ${match.scoreAgainst}</b></li>`).join('') || '<li class="share-card-empty">目前沒有可顯示的正式對戰紀錄。</li>';
  return `<article class="result-share-card" data-result-share-card><img class="share-bg texture" src="${shareCardAssets.backgrounds.texture}" alt="" data-share-optional><img class="share-bg lines" src="${shareCardAssets.backgrounds.lines}" alt="" data-share-optional><img class="share-silhouette" src="${shareCardAssets.backgrounds.silhouette}" alt="" data-share-optional><header><div class="share-logo"><img src="${presentation.leagueLogo}" alt="SPIN LEAGUE" data-share-logo><span>${shareCardAssets.fallback.league}</span></div><p>${escapeText(data.tournamentName)}</p><small>${escapeText(data.eventDate)}${data.venueName ? ` · ${escapeText(data.venueName)}` : ''}</small></header><img class="share-badge" src="${presentation.badge}" alt="名次徽章" data-share-optional><strong class="share-rank ${presentation.showRankNumber ? '' : 'hidden'}">${data.rank}</strong><section class="share-player"><h1>${escapeText(data.playerName)}</h1><img src="${presentation.tag}" alt="勝敗標籤" data-share-optional><p>${escapeText(presentation.performanceLabel)}</p></section><img class="share-divider" src="${shareCardAssets.dividers.center}" alt="" data-share-optional><section class="share-stats"><div><img src="${shareCardAssets.stats.record}" alt="" data-share-optional><b>${data.wins} 勝 ${data.losses} 敗</b><small>總勝敗</small></div><div><img src="${shareCardAssets.stats.score}" alt="" data-share-optional><b>${data.totalScore}</b><small>總得分</small></div><div><img src="${shareCardAssets.stats.winrate}" alt="" data-share-optional><b>${data.winRate}%</b><small>勝率</small></div><div><img src="${shareCardAssets.stats.performance}" alt="" data-share-optional><b>${escapeText(presentation.performanceLabel)}</b><small>表現標籤</small></div></section><section class="share-history ${data.matches.length > 5 ? 'is-compact' : ''}"><h2><img src="${shareCardAssets.icons.match}" alt="" data-share-optional>完整對戰紀錄 <small>共 ${data.matches.length} 場</small></h2><ul>${records}</ul>${data.matches.length > 10 ? `<p>另有 ${data.matches.length - 10} 場對戰已納入總戰績。</p>` : ''}</section><footer><img src="${presentation.venueLogo}" alt="${shareCardAssets.fallback.venue}" data-share-logo><span>${escapeText(data.venueName || shareCardAssets.fallback.venue)}</span></footer></article>`;
}

function escapeText(value) {
  return String(value || '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

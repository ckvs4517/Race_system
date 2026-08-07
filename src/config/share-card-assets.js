/** 集中管理分享圖素材與文字 fallback，避免模板散落硬編碼路徑。 */
const asset = (path) => new URL(`../assets/share-card/${path}`, import.meta.url).href;

export const shareCardAssets = {
  backgrounds: { texture: asset('backgrounds/bg_texture_dark.png'), lines: asset('backgrounds/bg_lines_red.png'), silhouette: asset('backgrounds/bg_spinning_top_silhouette.png') },
  badges: { champion: asset('badges/badge_champion.svg'), top4: asset('badges/badge_top4.svg'), top8: asset('badges/badge_top8.svg'), rank: asset('badges/badge_rank.svg') },
  stats: { record: asset('stats/icon_record.svg'), score: asset('stats/icon_score.svg'), winrate: asset('stats/icon_winrate.svg'), performance: asset('stats/icon_performance.svg') },
  icons: { match: asset('icons/icon_match.svg'), calendar: asset('icons/icon_calendar.svg'), location: asset('icons/icon_location.svg') },
  tags: { win: asset('tags/tag_win.svg'), loss: asset('tags/tag_loss.svg') },
  dividers: { center: asset('dividers/divider_center_red.svg'), dashed: asset('dividers/divider_dashed_red.svg') },
  logos: { league: asset('logos/logo_spinleague.svg'), venue: asset('logos/logo_88coffee.svg') },
  fallback: { league: 'SPIN LEAGUE', venue: '88coffee&tattoo' },
};

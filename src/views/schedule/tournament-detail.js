/** 單一賽事詳情頁的組裝器；只負責組合各 schedule 子畫面。 */
import { buildRounds, getTournamentStandings } from '../../domain/tournament.js';
import { getTournamentFormat } from '../../formats/registry.js';
import { icons } from '../../ui/icons.js';
import { pageHeader } from '../../ui/shell.js';
import { roundRobinTieBreakPanel, swissChampionLabel, swissDecisionPanel, swissStageGuide } from './decision-panels.js';
import { escapeText } from './html-escape.js';
import { leaderboardView, swissLiveLeaderboardRows } from './leaderboard.js';
import { eventInfoView, pairingEditorView, participantManagementView, tournamentWorkflowView } from './participant-panels.js';
import { currentRoundEntries, roundColumnView, swissRoundArenaCount } from './rounds.js';

export function tournamentDetailView(tournament, canManage, quickScoreMode = false) {
  const rounds = buildRounds(tournament);
  const format = getTournamentFormat(tournament.format);
  const isSwiss = format.id === 'swiss';
  const visibleRoundEntries = currentRoundEntries(tournament, rounds, isSwiss);
  const arenaCount = tournament.arenaCount || 1;
  const activeArenaCount = isSwiss && !tournament.swissStage2Config && ['final', 'completed'].includes(tournament.swissStage) ? 1 : arenaCount;
  const isDraft = tournament.status === '準備中';
  const isScheduling = tournament.status === '排程中';
  const checkedInCount = tournament.players.filter((player) => tournament.participantStates?.[player]?.checkedIn).length;
  const activePlayerCount = tournament.players.filter((player) => tournament.participantStates?.[player]?.status === 'active').length;
  const minimumPlayers = format.minPlayers || (isSwiss ? 4 : 2);
  const allSeedNames = new Set(isSwiss ? [] : rounds.map((round) => round.seedPlayer).filter(Boolean));
  const champion = tournament.champion ? `<div class="champion-banner">${icons.trophy}<span>${isSwiss ? swissChampionLabel(tournament) : '本屆冠軍'}</span><b>${escapeText(tournament.champion)}</b></div>` : '';
  const eventInfoPanel = eventInfoView(tournament.eventInfo);
  const workflowPanel = tournamentWorkflowView(tournament, canManage, { checkedInCount, minimumPlayers });
  const participantPanel = participantManagementView(tournament, canManage);
  const pairingPanel = format.supportsOpeningPairingEdit === false ? '' : pairingEditorView(tournament, canManage);
  const primaryAction = isDraft
    ? `<button class="button button-primary" data-action="prepare-tournament-schedule" ${checkedInCount >= minimumPlayers ? '' : 'disabled'}>確認報到，進入排程</button>`
    : isScheduling && !rounds.length
      ? '<button class="button button-primary" data-action="randomize-schedule">隨機分組</button>'
      : isScheduling
        ? '<button class="button button-primary" data-action="confirm-tournament-schedule">確認賽程並開始</button>'
        : '';
  const participantDataAction = isDraft ? '<button class="button button-secondary" data-manage-registration>私密參賽資料</button>' : '';
  const moreActions = canManage
    ? `<details class="schedule-more"><summary class="button button-secondary">⋯ 更多</summary><div class="schedule-more-menu">${isDraft ? '<button class="button button-secondary" data-action="edit-tournament">編輯賽事</button>' : ''}${participantDataAction}${isScheduling && rounds.length ? '<button class="button button-secondary" data-action="randomize-schedule">重新隨機分組</button>' : ''}<button class="button button-secondary" data-action="copy-current-tournament">複製賽事</button></div></details>`
    : '';
  const earlyFinish = canManage && tournament.status === '進行中' ? '<button class="button button-danger" data-action="complete-tournament-early">提前結束比賽</button>' : '';
  const quickScoreAction = canManage && tournament.status === '進行中'
    ? `<button type="button" class="button button-secondary quick-score-toggle ${quickScoreMode ? 'is-active' : ''}" data-action="toggle-quick-score" aria-pressed="${quickScoreMode ? 'true' : 'false'}">⚡ 快速登分${quickScoreMode ? ' ON' : ''}</button>`
    : '';
  const headerActions = `<div class="schedule-header-actions"><button class="button button-secondary" data-action="back-events">← 返回列表</button>${canManage ? primaryAction : ''}${quickScoreAction}${earlyFinish}${moreActions}</div>`;
  const guide = isDraft
    ? `<span><i class="draft-dot"></i>目前只確認報到名單，不會提前產生賽程</span><span>確認報到後才會進入隨機分組與手動調整階段</span>`
    : isScheduling
      ? `<span><i class="draft-dot"></i>排程階段尚未開放記分</span><span>${rounds.length ? '可以重新隨機分組或自由調整首輪對戰' : '請按「隨機分組」產生第一版賽程'}</span>`
    : `<span><i class="ready-dot"></i>只顯示目前輪次；已完成對戰可在排行榜點選選手查看</span><span>${isSwiss ? swissStageGuide(tournament) : '輪空選手已自動晉級'}</span>`;
  const bracket = visibleRoundEntries.length && !isDraft ? `<div class="bracket-shell"><div class="bracket-flow">${visibleRoundEntries.map(({ round, roundIndex }) => roundColumnView(tournament, round, roundIndex, canManage, isDraft || isScheduling, allSeedNames, isSwiss, swissRoundArenaCount(tournament, round, arenaCount))).join('')}</div></div>` : `<div class="bracket-pending">${icons.bracket}<h2>${isDraft ? '完成報到後再產生賽程' : isScheduling ? '等待隨機分組' : '等待賽程產生'}</h2><p>${isDraft ? '這個階段不會顯示預排對戰，避免現場名單尚未確認就產生錯誤賽程。' : isScheduling ? '按下「隨機分組」後，仍可自由調整首輪誰對誰。' : '正式賽程會顯示在這裡。'}</p></div>`;
  const swissDecision = isSwiss && !isDraft && !isScheduling ? swissDecisionPanel(tournament, canManage) : '';
  const roundRobinDecision = format.id === 'round_robin' && !isDraft && !isScheduling ? roundRobinTieBreakPanel(tournament, canManage) : '';
  const leaderboardRows = isSwiss ? swissLiveLeaderboardRows(tournament) : getTournamentStandings(tournament);
  const leaderboard = !isDraft && !isScheduling ? leaderboardView(tournament, leaderboardRows, isSwiss) : '';
  const preliminaryCount = rounds.filter((round) => (round.phase || 'preliminary') === 'preliminary').length;
  const quickScoreNotice = canManage && tournament.status === '進行中' && quickScoreMode
    ? '<div class="quick-score-notice"><b>⚡ 快速登分模式已開啟</b><span>點擊未完成對局會直接在本頁輸入裁判回報的最終比分。</span></div>'
    : '';
  return `<section class="section-wrap page-section${canManage && tournament.status === '進行中' && quickScoreMode ? ' quick-score-active' : ''}">${pageHeader(isDraft ? 'PLAYER CHECK-IN' : isScheduling ? 'SCHEDULE SETUP' : 'LIVE SCHEDULE', tournament.name, `${tournament.players.length} 位報名 · ${isDraft ? `${checkedInCount} 位已報到 · ` : `${activePlayerCount} 位參賽 · `}${format.name} · ${activeArenaCount} 台戰鬥台 · ${isSwiss && !isScheduling ? `瑞士預賽 ${Math.min(preliminaryCount, 4)}/4 輪 · ` : ''}${tournament.status} · 建立於 ${tournament.created}`, headerActions)}${workflowPanel}${eventInfoPanel}${champion}${participantPanel}<div class="bracket-guide">${guide}</div>${quickScoreNotice}${pairingPanel}${swissDecision}${roundRobinDecision}${bracket}${leaderboard}</section>`;
}

/** 賽事列表、分支圖、戰鬥台、選手狀態與排行榜的純 HTML 畫面產生器。 */
import { icons } from '../ui/icons.js';
import { pageHeader } from '../ui/shell.js';
import { buildRounds, getSwissPhaseStandings, getTournamentStandings } from '../domain/tournament.js';
import { createDrinkSummary } from '../domain/drinks.js';
import { getTournamentFormat } from '../formats/registry.js';
import { drinkSelectionFields } from './drink-fields.js';

export function scheduleView(tournaments, selectedId, canManage = false) {
  const selected = tournaments.find((item) => item.id === selectedId);
  if (selected) return bracketView(selected, canManage);
  const orderedTournaments = [...tournaments].sort(compareEventDates);
  const cards = orderedTournaments.map((item) => `<article class="event-card"><button class="event-open" data-tournament-id="${item.id}"><span class="event-status"><i></i>${escapeText(item.status || '準備中')}</span><div class="event-icon">${icons.trophy}</div><h2>${escapeText(item.name)}</h2><p>${item.players.length} 位選手 · ${escapeText(getTournamentFormat(item.format).name)} · ${item.arenaCount || 1} 台 · ${escapeText(formatEventDate(item.eventInfo?.date) || item.created)}</p>${item.eventInfo?.venueName ? `<small class="event-card-venue">${escapeText(item.eventInfo.venueName)}</small>` : ''}<span class="event-action">查看完整賽程 ${icons.arrow}</span></button>${canManage ? `<div class="event-card-actions"><button class="event-copy" data-copy-tournament="${item.id}" data-tournament-name="${escapeAttribute(item.name)}">複製賽事</button><button class="event-delete" data-delete-tournament="${item.id}" data-tournament-name="${escapeAttribute(item.name)}" aria-label="刪除 ${escapeAttribute(item.name)}">刪除賽事</button></div>` : ''}</article>`).join('');
  const createButton = canManage ? '<button class="button button-primary" data-route="manage">＋ 建立新賽事</button>' : '<button class="button button-secondary" data-route="control">主辦方登入</button>';
  return `<section class="section-wrap page-section">${pageHeader('TOURNAMENTS', '賽程表', '公開查看已建立的賽事、每輪對戰與即時排名。', createButton)} ${cards ? `<div class="event-grid">${cards}</div>` : `<div class="empty-state"><div>${icons.bracket}</div><h2>還沒有任何賽事</h2><p>主辦方建立賽事後，公開賽程會顯示在這裡。</p>${createButton}</div>`}</section>`;
}

function bracketView(tournament, canManage) {
  const rounds = buildRounds(tournament);
  const format = getTournamentFormat(tournament.format);
  const isSwiss = format.id === 'swiss';
  const visibleRoundEntries = currentRoundEntries(tournament, rounds, isSwiss);
  const arenaCount = tournament.arenaCount || 1;
  const activeArenaCount = isSwiss && ['final', 'completed'].includes(tournament.swissStage) ? 1 : arenaCount;
  const isDraft = tournament.status === '準備中';
  const isScheduling = tournament.status === '排程中';
  const checkedInCount = tournament.players.filter((player) => tournament.participantStates?.[player]?.checkedIn).length;
  const activePlayerCount = tournament.players.filter((player) => tournament.participantStates?.[player]?.status === 'active').length;
  const minimumPlayers = isSwiss ? 4 : 2;
  const allSeedNames = new Set(isSwiss ? [] : rounds.map((round) => round.seedPlayer).filter(Boolean));
  const champion = tournament.champion ? `<div class="champion-banner">${icons.trophy}<span>${isSwiss ? '四強循環賽第一名' : '本屆冠軍'}</span><b>${escapeText(tournament.champion)}</b></div>` : '';
  const eventInfoPanel = eventInfoView(tournament.eventInfo);
  const workflowPanel = tournamentWorkflowView(tournament, canManage, { checkedInCount, minimumPlayers });
  const registrationPanel = isDraft ? registrationQuickView(tournament, canManage) : '';
  const participantPanel = participantManagementView(tournament, canManage);
  const pairingPanel = pairingEditorView(tournament, canManage);
  const imageButton = tournament.status === '已完成' ? '<button class="button button-primary" data-action="download-tournament-image">下載完整賽程圖</button>' : '';
  const primaryAction = isDraft
    ? `<button class="button button-primary" data-action="prepare-tournament-schedule" ${checkedInCount >= minimumPlayers ? '' : 'disabled'}>確認報到，進入排程</button>`
    : isScheduling && !rounds.length
      ? '<button class="button button-primary" data-action="randomize-schedule">隨機分組</button>'
      : isScheduling
        ? '<button class="button button-primary" data-action="confirm-tournament-schedule">確認賽程並開始</button>'
        : '';
  const moreActions = canManage
    ? `<details class="schedule-more"><summary class="button button-secondary">⋯ 更多</summary><div class="schedule-more-menu">${isDraft ? '<button class="button button-secondary" data-action="edit-tournament">編輯賽事</button>' : ''}${isScheduling && rounds.length ? '<button class="button button-secondary" data-action="randomize-schedule">重新隨機分組</button>' : ''}<button class="button button-secondary" data-action="copy-current-tournament">複製賽事</button></div></details>`
    : '';
  const headerActions = `<div class="schedule-header-actions"><button class="button button-secondary" data-action="back-events">← 返回列表</button>${imageButton}${canManage ? primaryAction : ''}${moreActions}</div>`;
  const guide = isDraft
    ? `<span><i class="draft-dot"></i>目前只確認報到名單，不會提前產生賽程</span><span>確認報到後才會進入隨機分組與手動調整階段</span>`
    : isScheduling
      ? `<span><i class="draft-dot"></i>排程階段尚未開放記分</span><span>${rounds.length ? '可以重新隨機分組或自由調整首輪對戰' : '請按「隨機分組」產生第一版賽程'}</span>`
    : `<span><i class="ready-dot"></i>只顯示目前輪次；已完成對戰可在排行榜點選選手查看</span><span>${isSwiss ? swissStageGuide(tournament) : '輪空選手已自動晉級'}</span>`;
  const bracket = visibleRoundEntries.length && !isDraft ? `<div class="bracket-shell"><div class="bracket-flow">${visibleRoundEntries.map(({ round, roundIndex }) => roundColumnView(tournament, round, roundIndex, canManage, isDraft || isScheduling, allSeedNames, isSwiss, round.phase === 'final' ? 1 : arenaCount)).join('')}</div></div>` : `<div class="bracket-pending">${icons.bracket}<h2>${isDraft ? '完成報到後再產生賽程' : isScheduling ? '等待隨機分組' : '等待賽程產生'}</h2><p>${isDraft ? '這個階段不會顯示預排對戰，避免現場名單尚未確認就產生錯誤賽程。' : isScheduling ? '按下「隨機分組」後，仍可自由調整首輪誰對誰。' : '正式賽程會顯示在這裡。'}</p></div>`;
  const swissDecision = isSwiss && !isDraft && !isScheduling ? swissDecisionPanel(tournament, canManage) : '';
  const leaderboard = !isDraft && !isScheduling ? leaderboardView(tournament, getTournamentStandings(tournament), isSwiss) : '';
  const preliminaryCount = rounds.filter((round) => (round.phase || 'preliminary') === 'preliminary').length;
  return `<section class="section-wrap page-section">${pageHeader(isDraft ? 'PLAYER CHECK-IN' : isScheduling ? 'SCHEDULE SETUP' : 'LIVE SCHEDULE', tournament.name, `${tournament.players.length} 位報名 · ${isDraft ? `${checkedInCount} 位已報到 · ` : `${activePlayerCount} 位參賽 · `}${format.name} · ${activeArenaCount} 台戰鬥台 · ${isSwiss && !isScheduling ? `瑞士預賽 ${Math.min(preliminaryCount, 4)}/4 輪 · ` : ''}${tournament.status} · 建立於 ${tournament.created}`, headerActions)}${workflowPanel}${eventInfoPanel}${champion}${registrationPanel}${participantPanel}<div class="bracket-guide">${guide}</div>${pairingPanel}${swissDecision}${bracket}${leaderboard}</section>`;
}

function currentRoundEntries(tournament, projectedRounds, isSwiss) {
  const entries = projectedRounds.map((round, roundIndex) => ({ round, roundIndex }));
  if (tournament.status === '準備中' || tournament.status === '排程中') return entries;

  if (isSwiss && tournament.swissStage === 'qualification') return [];

  const activeEntry = entries.find(({ round }) => round.matches.some((match) => match.status === '可開始'));
  if (activeEntry) return [activeEntry];

  if (isSwiss) {
    const phase = tournament.swissStage === 'qualifier'
      ? 'qualifier'
      : ['final', 'completed'].includes(tournament.swissStage) ? 'final' : 'preliminary';
    const seriesId = phase === 'qualifier' ? tournament.activeQualifierSeriesId : null;
    const phaseEntries = entries.filter(({ round }) => (round.phase || 'preliminary') === phase
      && (!seriesId || round.seriesId === seriesId));
    return phaseEntries.length ? [phaseEntries.at(-1)] : [];
  }

  const storedRounds = Array.isArray(tournament.rounds) ? tournament.rounds.length : 0;
  return storedRounds ? [entries[Math.min(storedRounds - 1, entries.length - 1)]] : [];
}

function tournamentWorkflowView(tournament, canManage, readiness) {
  if (!canManage) return '';
  const steps = ['建立賽事', '招募選手', '選手報到', '產生賽程', '進行比賽', '完成'];
  let current = 0;
  if (tournament.status === '已完成') current = 5;
  else if (tournament.status === '進行中') current = 4;
  else if (tournament.status === '排程中') current = 3;
  else if (!tournament.players.length) current = 1;
  else if (readiness.checkedInCount < readiness.minimumPlayers) current = 2;
  else current = 3;
  return `<nav class="tournament-workflow" aria-label="賽事進度">${steps.map((step, index) => `<span class="${index < current ? 'is-done' : index === current ? 'is-current' : ''}"><i>${index < current ? '✓' : index + 1}</i>${step}</span>`).join('')}</nav>`;
}

function registrationQuickView(tournament, canManage) {
  if (!canManage) return '';
  const settings = tournament.registrationSettings || {};
  if (settings.enabled) {
    return `<section class="registration-quick is-open">
      <div><p class="kicker">PARTICIPANT INFORMATION</p><h2>參賽資料填寫連結已啟用</h2><p>請只傳給已確認資格的參賽者；送出後會直接加入正式名單。</p></div>
      <div class="registration-quick-actions"><button class="button button-primary" data-share-registration data-registration-token="${escapeAttribute(settings.token || '')}">分享私密連結</button><button class="button button-secondary" data-manage-registration>管理填寫資料</button></div>
    </section>`;
  }
  const capacity = Math.max(tournament.players.length, Number(settings.capacity) || 32);
  const deadline = String(settings.deadline || '').slice(0, 16);
  return `<section class="registration-quick">
    <div><p class="kicker">PARTICIPANT INFORMATION</p><h2>建立私密參賽資料連結</h2><p>主辦方確認參賽資格與付款後，再把連結交給選手填寫聯絡與飲品資料。</p></div>
    <button class="button button-primary" data-open-registration-setup>建立私密填寫連結</button>
    <dialog class="mobile-sheet" data-registration-setup-dialog>
      <form method="dialog" class="mobile-sheet-card" data-quick-registration-form>
        <div class="mobile-sheet-heading"><div><p class="kicker">PARTICIPANT INFORMATION</p><h2>啟用私密填寫連結</h2></div><button type="button" data-close-dialog aria-label="關閉">×</button></div>
        <p>填寫完成會直接加入正式名單，不需要核准。請只分享給已確認資格的人。</p>
        <label><span>參賽人數上限</span><input type="number" name="capacity" min="${Math.max(2, tournament.players.length)}" max="32" value="${capacity}" required></label>
        <label><span>截止時間（可不填）</span><input type="datetime-local" name="deadline" value="${escapeAttribute(deadline)}"></label>
        <div class="mobile-sheet-actions"><button type="button" class="button button-secondary" data-close-dialog>取消</button><button type="submit" class="button button-primary">啟用並複製連結</button></div>
      </form>
    </dialog>
  </section>`;
}

function pairingEditorView(tournament, canManage) {
  if (!canManage || tournament.status !== '排程中' || !tournament.rounds?.[0]?.matches?.length) return '';
  const activePlayers = tournament.players.filter((player) => tournament.participantStates?.[player]?.status === 'active');
  const allowBye = activePlayers.length % 2 === 1;
  const optionList = (selected, includeBye = false) => [
    ...activePlayers,
    ...(includeBye ? ['輪空'] : []),
  ].map((player) => `<option value="${escapeAttribute(player)}" ${player === selected ? 'selected' : ''}>${escapeText(player)}</option>`).join('');
  const rows = tournament.rounds[0].matches.map((match, index) => `<div class="pairing-editor-row" data-pairing-row>
    <span>第 ${index + 1} 場</span>
    <select name="playerA" aria-label="第 ${index + 1} 場選手 A">${optionList(match.playerA)}</select>
    <i>VS</i>
    <select name="playerB" aria-label="第 ${index + 1} 場選手 B">${optionList(match.playerB, allowBye)}</select>
  </div>`).join('');
  return `<section class="pairing-editor">
    <div class="pairing-editor-heading"><div><p class="kicker">MANUAL PAIRING</p><h2>調整首輪對戰</h2><p>可直接更換每場誰對誰；每位選手必須剛好出現一次，奇數人需保留一位輪空。</p></div><button class="button button-secondary" type="submit" form="opening-pairings-form">儲存調整</button></div>
    <form id="opening-pairings-form" data-opening-pairings-form>${rows}</form>
  </section>`;
}

function eventInfoView(info = {}) {
  const date = formatEventDate(info.date);
  const checkIn = info.checkInStart || info.checkInEnd
    ? `${info.checkInStart || '未定'}${info.checkInEnd ? `–${info.checkInEnd}` : ''}`
    : '';
  const location = [info.venueName, info.address].filter(Boolean).join(' · ');
  const mapUrl = safeHref(info.mapUrl);
  const postUrl = safeHref(info.postUrl);
  const hasContent = date || checkIn || info.startTime || location || mapUrl || postUrl || info.notes;
  if (!hasContent) return '';
  const facts = [
    date ? ['比賽日期', date] : null,
    checkIn ? ['報到時間', checkIn] : null,
    info.startTime ? ['正式開賽', info.startTime] : null,
    location ? ['比賽地點', location] : null,
  ].filter(Boolean).map(([label, value]) => `<div class="event-info-fact"><span>${label}</span><b>${escapeText(value)}</b></div>`).join('');
  const links = `${mapUrl ? `<a href="${escapeAttribute(mapUrl)}" target="_blank" rel="noopener noreferrer">開啟地圖</a>` : ''}${postUrl ? `<a href="${escapeAttribute(postUrl)}" target="_blank" rel="noopener noreferrer">查看原始貼文</a>` : ''}`;
  const notes = info.notes ? `<div class="event-info-notes"><span>活動備註</span><p>${escapeText(info.notes).replaceAll('\n', '<br>')}</p></div>` : '';
  return `<details class="event-info-panel"><summary class="event-info-heading"><div><p class="kicker">EVENT INFORMATION</p><h2>賽事資訊</h2></div><span class="event-info-toggle" aria-hidden="true"><i></i></span></summary><div class="event-info-content">${links ? `<div class="event-info-links">${links}</div>` : ''}${facts ? `<div class="event-info-facts">${facts}</div>` : ''}${notes}</div></details>`;
}

function formatEventDate(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${Number(match[1])}/${Number(match[2])}/${Number(match[3])}` : '';
}

function safeHref(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : '';
  } catch {
    return '';
  }
}

function compareEventDates(left, right) {
  const today = localDateKey(new Date());
  const leftDate = left.eventInfo?.date || '';
  const rightDate = right.eventInfo?.date || '';
  const group = (date) => !date ? 1 : date >= today ? 0 : 2;
  const groupDifference = group(leftDate) - group(rightDate);
  if (groupDifference) return groupDifference;
  if (leftDate && rightDate && leftDate !== rightDate) return group(leftDate) === 2 ? rightDate.localeCompare(leftDate) : leftDate.localeCompare(rightDate);
  return Number(right.id) - Number(left.id);
}

function localDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function participantManagementView(tournament, canManage) {
  if (tournament.status === '準備中') return draftCheckInView(tournament, canManage);
  const canChange = canManage && tournament.status === '進行中';
  const rows = tournament.players.map((player) => {
    const state = tournament.participantStates?.[player] || { status: 'active' };
    const inactive = state.status !== 'active';
    const eliminated = tournament.format === 'single_elimination' && (tournament.playerStats?.[player]?.losses || 0) > 0;
    const statusLabel = state.status === 'no_show' ? '未出席' : state.status === 'withdrawn' ? '已退賽' : eliminated ? '已淘汰' : '參賽中';
    const actions = canChange && !inactive && !eliminated
      ? `<div><button data-no-show-player="${escapeAttribute(player)}">未出席</button><button data-withdraw-player="${escapeAttribute(player)}">中途退賽</button></div>`
      : '';
    return `<div class="participant-row ${inactive || eliminated ? 'is-inactive' : ''}"><span>${escapeText(player)}</span><i>${statusLabel}</i>${actions}</div>`;
  }).join('');
  const activeCount = tournament.players.filter((player) => (tournament.participantStates?.[player]?.status || 'active') === 'active'
    && !(tournament.format === 'single_elimination' && (tournament.playerStats?.[player]?.losses || 0) > 0)).length;
  return `<details class="participant-management"><summary><span>選手狀態</span><b>${activeCount} 位參賽中</b></summary><div class="participant-list">${rows}</div></details>`;
}

function draftCheckInView(tournament, canManage) {
  const checkedInCount = tournament.players.filter((player) => tournament.participantStates?.[player]?.checkedIn).length;
  const minimumPlayers = tournament.format === 'swiss' ? 4 : 2;
  const rows = tournament.players.map((player) => {
    const checkedIn = Boolean(tournament.participantStates?.[player]?.checkedIn);
    const details = tournament.participantDetails?.[player] || {};
    return `<div class="check-in-row ${checkedIn ? 'is-checked-in' : ''}" data-roster-player="${escapeAttribute(player)}" data-checked-in="${checkedIn}">
      <label class="check-in-choice"><input type="checkbox" data-check-in-player="${escapeAttribute(player)}" ${checkedIn ? 'checked' : ''} ${canManage ? '' : 'disabled'}><span><b>${escapeText(player)}</b>${canManage ? `<small>${escapeText(details.drink?.displayName || '尚未選擇飲品')}</small>` : ''}</span></label>
      <i>${checkedIn ? '已報到' : '尚未報到'}</i>
      ${canManage ? `<button type="button" class="roster-edit-button" data-edit-player="${escapeAttribute(player)}">編輯</button>` : ''}
      ${canManage ? `<label class="roster-remove-choice"><input type="checkbox" data-remove-player-select="${escapeAttribute(player)}"><span>選取 ${escapeText(player)}</span></label>` : ''}
    </div>`;
  }).join('');
  const tools = canManage ? `<div class="check-in-tools">
    <label class="roster-search"><span class="sr-only">搜尋選手</span><input type="search" data-roster-search autocomplete="off" placeholder="搜尋選手名稱"></label>
    <div class="roster-filters" aria-label="名單篩選"><button type="button" class="is-active" data-roster-filter="all">全部</button><button type="button" data-roster-filter="unchecked">未報到</button><button type="button" data-roster-filter="checked">已報到</button></div>
    <div class="roster-tools-actions"><button type="button" class="button button-secondary" data-open-add-player>＋ 新增選手</button><button type="button" class="button button-secondary button-danger-quiet" data-enter-remove-mode>管理名單</button></div>
  </div>` : '';
  const dialogs = canManage ? `<dialog class="mobile-sheet" data-add-player-dialog>
      <form method="dialog" class="mobile-sheet-card" data-add-draft-player-form>
        <div class="mobile-sheet-heading"><div><p class="kicker">ADD PLAYER</p><h2>新增現場選手</h2></div><button type="button" data-close-dialog aria-label="關閉">×</button></div>
        <label><span>選手名稱</span><input name="playerName" maxlength="60" autocomplete="off" placeholder="輸入選手名稱" aria-label="現場報名選手名稱" required></label>
        <label><span>聯絡電話（選填）</span><input name="phone" type="tel" maxlength="40" autocomplete="tel"></label>
        ${drinkSelectionFields(tournament.drinkSettings, null, { required: false, prefix: 'addDrink' })}
        <div class="mobile-sheet-actions"><button type="button" class="button button-secondary" data-close-dialog>取消</button><button class="button button-primary" type="submit">新增到名單</button></div>
      </form>
    </dialog>
    <dialog class="mobile-sheet" data-edit-player-dialog>
      <form method="dialog" class="mobile-sheet-card" data-edit-draft-player-form>
        <div class="mobile-sheet-heading"><div><p class="kicker">EDIT PLAYER</p><h2>編輯參賽資料</h2></div><button type="button" data-close-dialog aria-label="關閉">×</button></div>
        <input type="hidden" name="originalName">
        <label><span>選手名稱</span><input name="playerName" maxlength="60" required></label>
        <label><span>聯絡電話</span><input name="phone" type="tel" maxlength="40"></label>
        <div data-edit-drink-slot></div>
        <div class="mobile-sheet-actions"><button type="button" class="button button-secondary" data-close-dialog>取消</button><button class="button button-primary" type="submit">儲存變更</button></div>
      </form>
    </dialog>
    <div class="roster-remove-bar" aria-live="polite"><span>已選取 <b data-remove-count>0</b> 位選手</span><div><button type="button" class="button button-secondary" data-cancel-remove-mode>取消</button><button type="button" class="button button-danger" data-confirm-remove-players disabled>移除選取選手</button></div></div>` : '';
  const guidance = checkedInCount >= minimumPlayers
    ? '已達開賽人數；未勾選者在開賽時會保留為未出席並排除賽程。'
    : `至少需要 ${minimumPlayers} 位選手完成報到才能開始賽事。`;
  return `<section class="check-in-panel">
    <div class="check-in-heading"><div><p class="kicker">PLAYER CHECK-IN</p><h2>參賽選手名單</h2></div><strong>已報到 ${checkedInCount}／報名 ${tournament.players.length} 人</strong></div>
    <p class="check-in-guidance">${guidance}</p>
    ${tools}
    ${canManage ? drinkSummaryView(tournament) : ''}
    <div class="check-in-list">${rows || '<div class="check-in-empty">目前沒有參賽選手，可分享私密填寫連結或新增現場選手。</div>'}</div>
    <div class="check-in-empty roster-filter-empty" hidden>找不到符合條件的選手。</div>
    ${dialogs}
  </section>`;
}

function drinkSummaryView(tournament) {
  if (!tournament.drinkSettings?.enabled) return '';
  const summary = createDrinkSummary(tournament);
  return `<details class="drink-summary"><summary>飲品統計 · 已選 ${summary.selectedCount}／${tournament.players.length}</summary><pre>${escapeText(summary.copyText)}</pre><button type="button" class="button button-secondary" data-copy-drink-summary="${escapeAttribute(summary.copyText)}">複製飲品統計</button></details>`;
}

function swissDecisionPanel(tournament, canManage) {
  const stage = tournament.swissStage || 'preliminary';
  if (stage === 'preliminary') return '';
  if (stage === 'qualifier') {
    const qualifierRows = getSwissPhaseStandings(tournament, 'qualifier');
    return `<section class="swiss-decision-panel"><p class="kicker">QUALIFIER</p><h2>資格積分決定賽進行中</h2><p>完成全部資格加賽後，系統會回到四強資格確認。</p>${swissMiniStandings(qualifierRows)}</section>`;
  }
  if (stage === 'final') return `<section class="swiss-decision-panel"><p class="kicker">TOP 4 FINAL</p><h2>前四名循環決賽</h2><p>四位選手統一使用戰鬥台 1，各互打一場，共三輪、六場；最終依勝場與總得分排列。</p><div class="swiss-finalists">${(tournament.finalists || []).map((player) => `<span>${escapeText(player)}</span>`).join('')}</div></section>`;
  if (stage === 'completed') return '';

  const rows = getTournamentStandings(tournament);
  const latestQualifier = tournament.qualifierSeriesCount ? getSwissPhaseStandings(tournament, 'qualifier') : [];
  const directFinalRows = getDirectFinalRows(rows, latestQualifier);
  const needsQualifier = !latestQualifier.length && hasTopFourTie(rows);
  if (!canManage) {
    return `<section class="swiss-decision-panel"><p class="kicker">TOP 4 QUALIFICATION</p><h2>四強資格確認中</h2><p>${needsQualifier ? '四強資格線有同分選手，主辦方正在安排資格積分決定賽或確認晉級名單。' : '前四名資格已明確，主辦方正在確認四強循環決賽名單。'}</p></section>`;
  }
  const qualifierChoices = swissPlayerChoices(rows, 'candidate');
  const directFinalChoices = swissPlayerChoices(directFinalRows, 'finalist', true);
  return `<section class="swiss-decision-panel">
    <p class="kicker">TOP 4 QUALIFICATION</p><h2>四強資格確認</h2>
    <p>${needsQualifier ? '四強資格線出現同分，前四名超過 4 位。可選擇同分選手建立資格積分決定賽，或由主辦方直接確認四強。' : '前四名資格已明確，確認名單後即可直接建立四強循環決賽。'}</p>
    ${latestQualifier.length ? `<div class="swiss-latest-qualifier"><h3>最近一組資格加賽結果</h3>${swissMiniStandings(latestQualifier)}</div>` : ''}
    <div class="swiss-decision-grid ${needsQualifier ? '' : 'is-direct-only'}">
      ${needsQualifier ? `<form data-swiss-qualifier-form><h3>資格積分決定賽</h3><div class="swiss-player-choices">${qualifierChoices}</div><button class="button button-secondary" type="submit">建立資格加賽</button></form>` : ''}
      <form data-swiss-final-form><h3>直接確認四強</h3><p class="swiss-choice-note">只列出目前排行榜前四名；確認無誤後即可建立決賽。</p><div class="swiss-player-choices">${directFinalChoices}</div><button class="button button-primary" type="submit">建立前四循環決賽</button></form>
    </div>
  </section>`;
}

function hasTopFourTie(rows) {
  return rows.filter((row) => row.rank <= 4).length > 4;
}

function swissPlayerChoices(rows, name, checked = false) {
  return rows.map((row) => `<label class="swiss-player-choice"><input type="checkbox" name="${name}" value="${escapeAttribute(row.player)}" ${checked ? 'checked' : ''}><span><b>${escapeText(row.player)}</b><small>${row.wins} 勝 ${row.losses} 敗 · 總得分 ${row.totalPoints}</small></span></label>`).join('');
}

function getDirectFinalRows(preliminaryRows, latestQualifierRows) {
  if (!latestQualifierRows.length) return preliminaryRows.slice(0, 4);
  const qualifierPlayers = new Set(latestQualifierRows.map((row) => row.player));
  const automaticRows = preliminaryRows.slice(0, 4).filter((row) => !qualifierPlayers.has(row.player));
  const openSlots = Math.max(0, 4 - automaticRows.length);
  return [...automaticRows, ...latestQualifierRows.slice(0, openSlots)];
}

function swissMiniStandings(rows) {
  return `<div class="swiss-mini-standings">${rows.map((row) => `<div><b>${row.rank}</b><span>${escapeText(row.player)}</span><i>${row.wins} 勝 ${row.losses} 敗</i><strong>總得分 ${row.totalPoints}</strong></div>`).join('')}</div>`;
}

function swissStageGuide(tournament) {
  return {
    preliminary: '完成第四輪後會暫停，由主辦方確認四強資格',
    qualification: '四輪預賽完成，等待主辦方確認四強或建立資格加賽',
    qualifier: '資格積分決定賽進行中',
    final: '前四名循環決賽進行中',
    completed: '前四名循環決賽已完成',
  }[tournament.swissStage || 'preliminary'];
}

function roundPhaseLabel(round, roundIndex) {
  const phase = round.phase || 'preliminary';
  if (phase === 'qualifier') return 'QUALIFIER';
  if (phase === 'final') return 'TOP 4 FINAL';
  return `ROUND ${String(roundIndex + 1).padStart(2, '0')}`;
}

function roundColumnView(tournament, round, roundIndex, canManage, isDraft, seedNames, isSwiss, arenaCount) {
  const completed = round.matches.every((match) => ['已完成', '輪空晉級'].includes(match.status));
  const toggle = completed ? '<i class="round-toggle" aria-hidden="true"></i>' : '';
  return `<details class="round-column ${completed ? 'is-completed' : ''} ${arenaCount > 1 ? 'has-battle-stations' : ''}" style="--station-count:${arenaCount}" ${completed ? '' : 'open'}>
    <summary class="round-heading"><span>${roundPhaseLabel(round, roundIndex)}</span><b>${escapeText(round.name)}</b>${toggle}</summary>
    <div class="round-matches ${isSwiss && roundIndex > 0 ? 'has-score-groups' : ''}">${roundMatchesView(tournament, round, roundIndex, canManage && !isDraft, canManage && tournament.bracketVersion === 2, seedNames, isSwiss, arenaCount)}</div>
  </details>`;
}

function leaderboardView(tournament, rows, isSwiss) {
  const metric = '總得分';
  const description = isSwiss ? '依勝場、敗場、總得分依序排名' : '依冠軍、勝場、總分與得失分差排序';
  return `<section class="leaderboard"><div class="leaderboard-heading"><div><p class="kicker">${isSwiss ? 'LIVE STANDINGS' : 'LIVE STANDINGS'}</p><h2>賽事排行榜</h2></div><span>${description}；點選選手可查看已完成對戰</span></div><div class="leaderboard-table"><div class="leaderboard-row leaderboard-header"><span>名次</span><span>選手</span><span>勝</span><span>敗</span><span>${metric}</span></div>${rows.map((row) => leaderboardPlayerRow(tournament, row)).join('')}</div></section>`;
}

function leaderboardPlayerRow(tournament, row) {
  const status = row.isChampion ? '<small>CHAMPION</small>' : row.participantStatus === 'no_show' ? '<small>未出席</small>' : row.participantStatus === 'withdrawn' ? '<small>已退賽</small>' : '';
  const matches = playerCompletedMatches(tournament, row.player);
  const history = matches.length
    ? matches.map((entry) => `<li><span>${escapeText(roundPhaseLabel(entry.round, entry.roundIndex))}</span><b>${escapeText(entry.opponent)}</b><i>${escapeText(entry.result)}</i></li>`).join('')
    : '<li class="player-history-empty">尚無已完成對戰紀錄。</li>';
  return `<details class="leaderboard-player ${row.isChampion ? 'is-champion' : ''} ${row.participantStatus !== 'active' ? 'is-inactive' : ''}">
    <summary class="leaderboard-row"><span class="rank">${row.rank === 1 ? icons.trophy : String(row.rank).padStart(2, '0')}</span><strong>${escapeText(row.player)}${status}<em>對戰紀錄</em></strong><span>${row.wins}</span><span>${row.losses}</span><b>${row.totalPoints}</b></summary>
    <div class="player-history"><h3>${escapeText(row.player)}的已完成對戰</h3><ul>${history}</ul></div>
  </details>`;
}

function playerCompletedMatches(tournament, player) {
  return (tournament.rounds || []).flatMap((round, roundIndex) => round.matches
    .filter((match) => (match.playerA === player || match.playerB === player) && ['已完成', '輪空晉級'].includes(match.status))
    .map((match) => {
      const isA = match.playerA === player;
      const opponent = isA ? match.playerB : match.playerA;
      const isBye = opponent === '輪空';
      const score = isBye ? '輪空晉級' : `${isA ? match.scoreA : match.scoreB}：${isA ? match.scoreB : match.scoreA}`;
      const result = isBye ? score : `${match.winner === player ? '勝' : '敗'} · ${score}`;
      return { round, roundIndex, opponent: isBye ? '輪空' : opponent, result };
    }));
}

function roundMatchesView(tournament, round, roundIndex, scoringEnabled, replayEnabled, seedNames, isSwiss, arenaCount) {
  const entries = round.matches.map((match, matchIndex) => ({ match, matchIndex }));
  if (arenaCount === 1) return scoreGroupedMatchesView(tournament, round, roundIndex, entries, scoringEnabled, replayEnabled, seedNames, isSwiss);

  // 依比賽順序輪流分配戰鬥台，讓各台場數最多只差一場。
  const stations = Array.from({ length: arenaCount }, () => []);
  entries.forEach((entry, index) => stations[index % arenaCount].push(entry));
  return `<div class="battle-stations">${stations.map((stationEntries, stationIndex) => `<section class="battle-station"><div class="battle-station-title"><span>戰鬥台 ${stationIndex + 1}</span><i>${stationEntries.length ? `${stationEntries.length} 場對戰` : '本輪待命'}</i></div>${stationEntries.length ? scoreGroupedMatchesView(tournament, round, roundIndex, stationEntries, scoringEnabled, replayEnabled, seedNames, isSwiss) : '<div class="battle-station-empty">本輪沒有分配對戰</div>'}</section>`).join('')}</div>`;
}

function scoreGroupedMatchesView(tournament, round, roundIndex, entries, scoringEnabled, replayEnabled, seedNames, isSwiss) {
  if (!isSwiss || roundIndex === 0 || (round.phase || 'preliminary') !== 'preliminary') return `<div class="station-match-list">${entries.map(({ match, matchIndex }) => matchCard(match, roundIndex, matchIndex, scoringEnabled, replayEnabled, seedNames, round.seedReason, isSwiss)).join('')}</div>`;

  const groups = new Map();
  entries.forEach((entry) => {
    const label = swissGroupLabel(tournament, roundIndex, entry.match);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(entry);
  });
  return [...groups].map(([label, matches]) => `<section class="swiss-score-group"><div class="swiss-score-group-title"><span>${escapeText(label)}</span><i>${matches.length} 場對戰</i></div><div class="swiss-score-group-matches">${matches.map(({ match, matchIndex }) => matchCard(match, roundIndex, matchIndex, scoringEnabled, replayEnabled, seedNames, round.seedReason, isSwiss)).join('')}</div></section>`).join('');
}

function swissGroupLabel(tournament, roundIndex, match) {
  const wins = Object.fromEntries((tournament.players || []).map((player) => [player, 0]));
  (tournament.rounds || []).slice(0, roundIndex).forEach((round) => round.matches.forEach((previousMatch) => {
    if (previousMatch.winner && previousMatch.winner !== '輪空') wins[previousMatch.winner] = (wins[previousMatch.winner] || 0) + 1;
  }));
  const winsA = wins[match.playerA] || 0;
  const winsB = match.playerB === '輪空' ? winsA : wins[match.playerB] || 0;
  if (roundIndex === 1 && winsA === winsB) return winsA === 1 ? '勝者組' : '敗者組';
  if (winsA === winsB) return `${winsA} 勝組`;
  return `${Math.max(winsA, winsB)} 勝／${Math.min(winsA, winsB)} 勝跨組配對`;
}

function matchCard(match, roundIndex, matchIndex, scoringEnabled, replayEnabled, seedNames, seedReason, isSwiss) {
  const interactive = scoringEnabled && match.status === '可開始';
  const scoreA = match.scoreA ?? '—';
  const scoreB = match.scoreB ?? '—';
  const displayStatus = match.outcome === 'withdrawal'
    ? '退賽判定 4：0'
    : match.outcome === 'forfeit'
      ? '棄賽判定 4：0'
      : match.status === '輪空晉級' && isSwiss
    ? (scoringEnabled ? '輪空得勝' : '預定輪空')
    : scoringEnabled && match.status === '輪空晉級' && seedReason === 'performance'
    ? '表現種子晉級'
    : scoringEnabled && match.status === '輪空晉級' && seedReason === 'random'
      ? '隨機種子晉級'
      : !scoringEnabled && match.status === '輪空晉級'
    ? '預定輪空'
    : !scoringEnabled && match.status === '可開始' ? '等待賽事開始' : match.status;
  const content = `<div class="match-meta"><span>MATCH ${String(matchIndex + 1).padStart(2, '0')}</span><i>${displayStatus}</i></div><div class="competitor ${match.playerA === '輪空' || match.playerA === '待定' ? 'muted' : ''} ${scoringEnabled && match.winner === match.playerA ? 'winner' : ''} ${match.forfeitPlayer === match.playerA ? 'administrative-loser' : ''}"><span>${escapeText(match.playerA)}${seedNames.has(match.playerA) ? '<small>SEED</small>' : ''}${match.forfeitPlayer === match.playerA ? `<small>${match.outcome === 'withdrawal' ? '退賽' : '棄賽'}</small>` : ''}</span><b>${scoreA}</b></div><div class="competitor ${match.playerB === '輪空' || match.playerB === '待定' ? 'muted' : ''} ${scoringEnabled && match.winner === match.playerB ? 'winner' : ''} ${match.forfeitPlayer === match.playerB ? 'administrative-loser' : ''}"><span>${escapeText(match.playerB)}${seedNames.has(match.playerB) ? '<small>SEED</small>' : ''}${match.forfeitPlayer === match.playerB ? `<small>${match.outcome === 'withdrawal' ? '退賽' : '棄賽'}</small>` : ''}</span><b>${scoreB}</b></div>`;
  if (interactive) return `<button class="match-card is-ready" data-round-index="${roundIndex}" data-match-index="${matchIndex}">${content}</button>`;
  if (scoringEnabled && match.status === '已完成') return `<article class="match-card is-complete">${content}${replayEnabled && match.outcome !== 'withdrawal' ? `<button class="match-replay" data-replay-round="${roundIndex}" data-replay-match="${matchIndex}">重新比賽</button>` : ''}</article>`;
  return `<article class="match-card">${content}</article>`;
}

function escapeAttribute(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function escapeText(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

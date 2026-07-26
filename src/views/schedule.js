/** 賽事列表、分支圖、戰鬥台、選手狀態與排行榜的純 HTML 畫面產生器。 */
import { icons } from '../ui/icons.js';
import { pageHeader } from '../ui/shell.js';
import { buildRounds, getSwissPhaseStandings, getTournamentStandings, requiredSeedCount } from '../domain/tournament.js';
import { getTournamentFormat } from '../formats/registry.js';

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
  const visibleRoundEntries = rounds
    .map((round, roundIndex) => ({ round, roundIndex }))
    .filter(({ round }) => !isSwiss || !['final', 'completed'].includes(tournament.swissStage) || round.phase === 'final');
  const arenaCount = tournament.arenaCount || 1;
  const activeArenaCount = isSwiss && ['final', 'completed'].includes(tournament.swissStage) ? 1 : arenaCount;
  const isDraft = tournament.status === '準備中';
  const seedCount = requiredSeedCount(tournament);
  const seedIndexes = tournament.seedPlayerIndexes || [];
  const seedsReady = seedCount === 0 || seedIndexes.length === seedCount;
  const checkedInCount = tournament.players.filter((player) => tournament.participantStates?.[player]?.checkedIn).length;
  const minimumPlayers = isSwiss ? 4 : 2;
  const seedNames = seedIndexes.map((index) => tournament.players[index]).filter(Boolean);
  const allSeedNames = new Set(isSwiss ? [] : rounds.map((round) => round.seedPlayer).filter(Boolean));
  const champion = tournament.champion ? `<div class="champion-banner">${icons.trophy}<span>${isSwiss ? '四強循環賽第一名' : '本屆冠軍'}</span><b>${escapeText(tournament.champion)}</b></div>` : '';
  const eventInfoPanel = eventInfoView(tournament.eventInfo);
  const workflowPanel = tournamentWorkflowView(tournament, canManage, { checkedInCount, minimumPlayers, seedsReady });
  const registrationPanel = isDraft ? registrationQuickView(tournament, canManage) : '';
  const participantPanel = participantManagementView(tournament, canManage);
  const seedButton = isDraft && seedCount > 0 ? `<button class="button button-secondary" data-action="draw-seeds">${seedsReady ? '重新抽選種子' : '隨機抽選種子'}（${seedCount} 位）</button>` : '';
  const randomizeButton = isDraft ? '<button class="button button-secondary" data-action="randomize-bracket">重新隨機分組</button>' : '';
  const imageButton = tournament.status === '已完成' ? '<button class="button button-primary" data-action="download-tournament-image">下載完整賽程圖</button>' : '';
  const primaryDraftAction = !seedsReady
    ? `<button class="button button-primary" data-action="draw-seeds">抽選 ${seedCount} 位種子</button>`
    : `<button class="button button-primary" data-action="start-tournament" ${checkedInCount >= minimumPlayers ? '' : 'disabled'}>開始賽事</button>`;
  const moreActions = canManage
    ? `<details class="schedule-more"><summary class="button button-secondary">⋯ 更多</summary><div class="schedule-more-menu">${isDraft ? `<button class="button button-secondary" data-action="edit-tournament">編輯賽事</button>${randomizeButton}${seedsReady ? seedButton : ''}` : ''}<button class="button button-secondary" data-action="copy-current-tournament">複製賽事</button></div></details>`
    : '';
  const headerActions = `<div class="schedule-header-actions"><button class="button button-secondary" data-action="back-events">← 返回列表</button>${imageButton}${canManage && isDraft ? primaryDraftAction : ''}${moreActions}</div>`;
  const guide = isDraft
    ? isSwiss
      ? `<span><i class="draft-dot"></i>固定進行四輪瑞士制預賽</span><span>四輪後由主辦方確認四強或建立資格積分決定賽</span>`
      : `<span><i class="draft-dot"></i>${seedsReady ? '目前為預覽賽程，開始前可重新抽選種子' : `需要先抽選 ${seedCount} 位種子選手`}</span><span>按下「賽事開始」後種子與名單都會鎖定</span>`
    : `<span><i class="ready-dot"></i>可點擊「可開始」的節點進入記分板</span><span>${isSwiss ? swissStageGuide(tournament) : '輪空選手已自動晉級'}</span>`;
  const seedPanel = seedCount > 0 ? `<div class="seed-panel ${seedsReady ? 'is-drawn' : ''}"><div class="seed-panel-copy"><span>INITIAL SEED</span><b>${seedsReady ? '已抽出首輪種子選手' : '本賽事首輪需要 1 位種子選手'}</b><p>${seedsReady ? (isDraft ? '種子選手首輪輪空；賽事開始前仍可重新抽選。' : '首輪種子與參賽名單已隨賽事開始鎖定。') : '請使用上方按鈕隨機抽選，完成後才會產生正式預覽賽程。'}</p></div><div class="seed-list">${seedsReady ? seedNames.map((name) => `<span>${escapeText(name)}<i>SEED</i></span>`).join('') : '<em>等待種子抽選</em>'}</div></div>` : '';
  const bracket = visibleRoundEntries.length ? `<div class="bracket-shell"><div class="bracket-flow">${visibleRoundEntries.map(({ round, roundIndex }) => roundColumnView(tournament, round, roundIndex, canManage, isDraft, allSeedNames, isSwiss, round.phase === 'final' ? 1 : arenaCount)).join('')}</div></div>` : `<div class="bracket-pending">${icons.bracket}<h2>${tournament.players.length ? '等待賽程產生' : '等待參賽名單'}</h2><p>${tournament.players.length ? '主辦方完成設定後，正式賽程會顯示在這裡。' : '可以手動加入選手，或前往報名管理開放公開報名。'}</p></div>`;
  const swissDecision = isSwiss && !isDraft ? swissDecisionPanel(tournament, canManage) : '';
  const leaderboard = (isSwiss && !isDraft) || tournament.champion ? leaderboardView(getTournamentStandings(tournament), isSwiss) : '';
  const preliminaryCount = rounds.filter((round) => (round.phase || 'preliminary') === 'preliminary').length;
  return `<section class="section-wrap page-section">${pageHeader(isDraft ? 'SCHEDULE PREVIEW' : 'LIVE SCHEDULE', tournament.name, `${tournament.players.length} 位報名 · ${isDraft ? `${checkedInCount} 位已報到 · ` : ''}${format.name} · ${activeArenaCount} 台戰鬥台 · ${isSwiss ? `瑞士預賽 ${Math.min(preliminaryCount, 4)}/4 輪 · ` : ''}${isDraft ? '準備中' : tournament.status} · 建立於 ${tournament.created}`, headerActions)}${workflowPanel}${eventInfoPanel}${champion}${registrationPanel}${participantPanel}${seedPanel}<div class="bracket-guide">${guide}</div>${swissDecision}${bracket}${leaderboard}</section>`;
}

function tournamentWorkflowView(tournament, canManage, readiness) {
  if (!canManage) return '';
  const steps = ['建立賽事', '招募選手', '選手報到', '產生賽程', '進行比賽', '完成'];
  let current = 0;
  if (tournament.status === '已完成') current = 5;
  else if (tournament.status === '進行中') current = 4;
  else if (!tournament.players.length) current = 1;
  else if (readiness.checkedInCount < readiness.minimumPlayers) current = 2;
  else if (!readiness.seedsReady) current = 3;
  else current = 3;
  return `<nav class="tournament-workflow" aria-label="賽事進度">${steps.map((step, index) => `<span class="${index < current ? 'is-done' : index === current ? 'is-current' : ''}"><i>${index < current ? '✓' : index + 1}</i>${step}</span>`).join('')}</nav>`;
}

function registrationQuickView(tournament, canManage) {
  if (!canManage) return '';
  const settings = tournament.registrationSettings || {};
  if (settings.enabled) {
    return `<section class="registration-quick is-open">
      <div><p class="kicker">PUBLIC REGISTRATION</p><h2>公開報名中</h2><p>報名連結已啟用，可直接分享給選手；收到的新報名會先進入待審名單。</p></div>
      <div class="registration-quick-actions"><button class="button button-primary" data-share-registration data-registration-token="${escapeAttribute(settings.token || '')}">分享報名連結</button><button class="button button-secondary" data-manage-registration>查看報名名單</button></div>
    </section>`;
  }
  const capacity = Math.max(tournament.players.length, Number(settings.capacity) || 32);
  const deadline = String(settings.deadline || '').slice(0, 16);
  return `<section class="registration-quick">
    <div><p class="kicker">PUBLIC REGISTRATION</p><h2>需要招募選手嗎？</h2><p>從這場賽事直接建立公開表單，選手填寫後由主辦方核准加入名單。</p></div>
    <button class="button button-primary" data-open-registration-setup>建立公開報名連結</button>
    <dialog class="mobile-sheet" data-registration-setup-dialog>
      <form method="dialog" class="mobile-sheet-card" data-quick-registration-form>
        <div class="mobile-sheet-heading"><div><p class="kicker">PUBLIC REGISTRATION</p><h2>開放公開報名</h2></div><button type="button" data-close-dialog aria-label="關閉">×</button></div>
        <p>設定名額與截止時間後，系統會立即建立這場賽事專用的報名連結。</p>
        <label><span>報名人數上限</span><input type="number" name="capacity" min="${Math.max(1, tournament.players.length)}" max="32" value="${capacity}" required></label>
        <label><span>截止時間（可不填）</span><input type="datetime-local" name="deadline" value="${escapeAttribute(deadline)}"></label>
        <div class="mobile-sheet-actions"><button type="button" class="button button-secondary" data-close-dialog>取消</button><button type="submit" class="button button-primary">開放報名並複製連結</button></div>
      </form>
    </dialog>
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
    return `<div class="check-in-row ${checkedIn ? 'is-checked-in' : ''}" data-roster-player="${escapeAttribute(player)}" data-checked-in="${checkedIn}">
      <label class="check-in-choice"><input type="checkbox" data-check-in-player="${escapeAttribute(player)}" ${checkedIn ? 'checked' : ''} ${canManage ? '' : 'disabled'}><span>${escapeText(player)}</span></label>
      <i>${checkedIn ? '已報到' : '尚未報到'}</i>
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
        <div class="mobile-sheet-actions"><button type="button" class="button button-secondary" data-close-dialog>取消</button><button class="button button-primary" type="submit">新增到名單</button></div>
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
    <div class="check-in-list">${rows || '<div class="check-in-empty">目前沒有參賽選手，可從公開報名核准或新增現場選手。</div>'}</div>
    <div class="check-in-empty roster-filter-empty" hidden>找不到符合條件的選手。</div>
    ${dialogs}
  </section>`;
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
  if (!canManage) {
    return '<section class="swiss-decision-panel"><p class="kicker">TOP 4 QUALIFICATION</p><h2>四強資格確認中</h2><p>主辦方正在確認直接晉級名單，或安排同分選手進行資格積分決定賽。</p></section>';
  }
  const qualifierChoices = swissPlayerChoices(rows, 'candidate');
  const directFinalRows = getDirectFinalRows(rows, latestQualifier);
  const directFinalChoices = swissPlayerChoices(directFinalRows, 'finalist', true);
  return `<section class="swiss-decision-panel">
    <p class="kicker">TOP 4 QUALIFICATION</p><h2>四強資格確認</h2>
    <p>四輪預賽已完成。你可以選 2～6 位建立資格積分決定賽，完成後再回來確認；也可以直接選取正好 4 位進入四強循環決賽。</p>
    ${latestQualifier.length ? `<div class="swiss-latest-qualifier"><h3>最近一組資格加賽結果</h3>${swissMiniStandings(latestQualifier)}</div>` : ''}
    <div class="swiss-decision-grid">
      <form data-swiss-qualifier-form><h3>資格積分決定賽</h3><div class="swiss-player-choices">${qualifierChoices}</div><button class="button button-secondary" type="submit">建立資格加賽</button></form>
      <form data-swiss-final-form><h3>直接確認四強</h3><p class="swiss-choice-note">只列出目前排行榜前四名；確認無誤後即可建立決賽。</p><div class="swiss-player-choices">${directFinalChoices}</div><button class="button button-primary" type="submit">建立前四循環決賽</button></form>
    </div>
  </section>`;
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

function leaderboardView(rows, isSwiss) {
  const metric = '總得分';
  const description = isSwiss ? '依勝場、敗場、總得分依序排名' : '依冠軍、勝場、總分與得失分差排序';
  return `<section class="leaderboard"><div class="leaderboard-heading"><div><p class="kicker">${isSwiss ? 'LIVE STANDINGS' : 'FINAL STANDINGS'}</p><h2>賽事排行榜</h2></div><span>${description}</span></div><div class="leaderboard-table"><div class="leaderboard-row leaderboard-header"><span>名次</span><span>選手</span><span>勝</span><span>敗</span><span>${metric}</span></div>${rows.map((row) => `<div class="leaderboard-row ${row.isChampion ? 'is-champion' : ''} ${row.participantStatus !== 'active' ? 'is-inactive' : ''}"><span class="rank">${row.rank === 1 ? icons.trophy : String(row.rank).padStart(2, '0')}</span><strong>${escapeText(row.player)}${row.isChampion ? '<small>CHAMPION</small>' : ''}${row.participantStatus === 'no_show' ? '<small>未出席</small>' : row.participantStatus === 'withdrawn' ? '<small>已退賽</small>' : ''}</strong><span>${row.wins}</span><span>${row.losses}</span><b>${row.totalPoints}</b></div>`).join('')}</div></section>`;
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

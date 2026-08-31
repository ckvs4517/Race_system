/** 報到、參賽名單、報名捷徑、賽事資訊與首輪調整面板。 */
import { MAX_TOURNAMENT_PLAYERS } from '../../domain/tournament.js';
import { getTournamentFormat } from '../../formats/registry.js';
import { formatEventDate } from './event-date.js';
import { escapeAttribute, escapeText } from './html-escape.js';

export function tournamentWorkflowView(tournament, canManage, readiness) {
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

export function registrationQuickView(tournament, canManage) {
  if (!canManage) return '';
  const settings = tournament.registrationSettings || {};
  if (settings.enabled) {
    return `<section class="registration-quick is-open">
      <div><p class="kicker">PARTICIPANT INFORMATION</p><h2>參賽資料填寫連結已啟用</h2><p>請只傳給已確認資格的參賽者；送出後會直接加入正式名單，備註可用來記錄電話末五碼、飲品或現場事項。</p></div>
      <div class="registration-quick-actions"><button class="button button-primary" data-share-registration data-registration-token="${escapeAttribute(settings.token || '')}">分享私密連結</button><button class="button button-secondary" data-manage-registration>管理填寫資料</button></div>
    </section>`;
  }
  const capacity = Math.max(tournament.players.length, Number(settings.capacity) || MAX_TOURNAMENT_PLAYERS);
  const deadline = String(settings.deadline || '').slice(0, 16);
  return `<section class="registration-quick">
    <div><p class="kicker">PARTICIPANT INFORMATION</p><h2>建立私密參賽資料連結</h2><p>主辦方確認參賽資格與付款後，再把連結交給選手填寫聯絡與備註資料。</p></div>
    <button class="button button-primary" data-open-registration-setup>建立私密填寫連結</button>
    <dialog class="mobile-sheet" data-registration-setup-dialog>
      <form method="dialog" class="mobile-sheet-card" data-quick-registration-form>
        <div class="mobile-sheet-heading"><div><p class="kicker">PARTICIPANT INFORMATION</p><h2>啟用私密填寫連結</h2></div><button type="button" data-close-dialog aria-label="關閉">×</button></div>
        <p>填寫完成會直接加入正式名單，不需要核准。請只分享給已確認資格的人。</p>
        <label><span>參賽人數上限</span><input type="number" name="capacity" min="${Math.max(2, tournament.players.length)}" max="${MAX_TOURNAMENT_PLAYERS}" value="${capacity}" required></label>
        <label><span>截止時間（可不填）</span><input type="datetime-local" name="deadline" value="${escapeAttribute(deadline)}"></label>
        <div class="mobile-sheet-actions"><button type="button" class="button button-secondary" data-close-dialog>取消</button><button type="submit" class="button button-primary">啟用並複製連結</button></div>
      </form>
    </dialog>
  </section>`;
}

export function pairingEditorView(tournament, canManage) {
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

export function eventInfoView(info = {}) {
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

export function participantManagementView(tournament, canManage) {
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

function safeHref(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : '';
  } catch {
    return '';
  }
}

function draftCheckInView(tournament, canManage) {
  const checkedInCount = tournament.players.filter((player) => tournament.participantStates?.[player]?.checkedIn).length;
  const minimumPlayers = getTournamentFormat(tournament.format).minPlayers || (tournament.format === 'swiss' ? 4 : 2);
  const rows = tournament.players.map((player) => {
    const checkedIn = Boolean(tournament.participantStates?.[player]?.checkedIn);
    const details = tournament.participantDetails?.[player] || {};
    const rosterNote = String(details.notes || '').trim() || (details.drink?.displayName ? `舊飲品：${details.drink.displayName}` : '');
    return `<div class="check-in-row ${checkedIn ? 'is-checked-in' : ''}" data-roster-player="${escapeAttribute(player)}" data-checked-in="${checkedIn}">
      <label class="check-in-choice"><input type="checkbox" data-check-in-player="${escapeAttribute(player)}" ${checkedIn ? 'checked' : ''} ${canManage ? '' : 'disabled'}><span><b>${escapeText(player)}</b>${canManage && rosterNote ? `<small>${escapeText(rosterNote)}</small>` : ''}</span></label>
      <i>${checkedIn ? '已報到' : '尚未報到'}</i>
      ${canManage ? `<button type="button" class="roster-edit-button" data-edit-player="${escapeAttribute(player)}">編輯</button>` : ''}
      ${canManage ? `<label class="roster-remove-choice"><input type="checkbox" data-remove-player-select="${escapeAttribute(player)}"><span>選取 ${escapeText(player)}</span></label>` : ''}
    </div>`;
  }).join('');
  const tools = canManage ? `<div class="check-in-tools">
    <label class="roster-search"><span class="sr-only">搜尋選手</span><input type="search" data-roster-search autocomplete="off" placeholder="搜尋選手名稱"></label>
    <div class="roster-filters" aria-label="名單篩選"><button type="button" class="is-active" data-roster-filter="all">全部</button><button type="button" data-roster-filter="unchecked">未報到</button><button type="button" data-roster-filter="checked">已報到</button></div>
    <div class="roster-tools-actions"><button type="button" class="button button-secondary" data-check-in-all ${checkedInCount >= tournament.players.length && tournament.players.length ? 'disabled' : ''}>全部報到</button><button type="button" class="button button-secondary" data-open-add-player>＋ 新增選手</button><button type="button" class="button button-secondary button-danger-quiet" data-enter-remove-mode>管理名單</button></div>
  </div>` : '';
  const dialogs = canManage ? `<dialog class="mobile-sheet" data-add-player-dialog>
      <form method="dialog" class="mobile-sheet-card" data-add-draft-player-form>
        <div class="mobile-sheet-heading"><div><p class="kicker">ADD PLAYER</p><h2>新增現場選手</h2></div><button type="button" data-close-dialog aria-label="關閉">×</button></div>
        <label><span>選手名稱</span><input name="playerName" maxlength="60" autocomplete="off" placeholder="輸入選手名稱" aria-label="現場報名選手名稱" required></label>
        <input type="hidden" name="phone" value="">
        <label><span>備註（選填）</span><textarea name="notes" maxlength="500" placeholder="例如：12345 · 無糖綠茶 · 已付款"></textarea></label>
        <div class="mobile-sheet-actions"><button type="button" class="button button-secondary" data-close-dialog>取消</button><button class="button button-primary" type="submit">新增到名單</button></div>
      </form>
    </dialog>
    <dialog class="mobile-sheet" data-edit-player-dialog>
      <form method="dialog" class="mobile-sheet-card" data-edit-draft-player-form>
        <div class="mobile-sheet-heading"><div><p class="kicker">EDIT PLAYER</p><h2>編輯參賽資料</h2></div><button type="button" data-close-dialog aria-label="關閉">×</button></div>
        <input type="hidden" name="originalName">
        <label><span>選手名稱</span><input name="playerName" maxlength="60" required></label>
        <input type="hidden" name="phone">
        <label><span>備註</span><textarea name="notes" maxlength="500" placeholder="例如：12345 · 無糖綠茶 · 已付款"></textarea></label>
        <div class="mobile-sheet-actions"><button type="button" class="button button-secondary" data-close-dialog>取消</button><button class="button button-primary" type="submit">儲存變更</button></div>
      </form>
    </dialog>
    <div class="roster-remove-bar" aria-live="polite"><span>已選取 <b data-remove-count>0</b> 位選手</span><div><button type="button" class="button button-secondary" data-cancel-remove-mode>取消</button><button type="button" class="button button-danger" data-confirm-remove-players disabled>移除選取選手</button></div></div>` : '';
  const guidance = checkedInCount >= minimumPlayers
    ? '已達開賽人數；未勾選者在開賽時會保留為未出席並排除賽程。'
    : `至少需要 ${minimumPlayers} 位選手完成報到才能開始賽事。`;
  return `<section class="check-in-panel" data-check-in-minimum="${minimumPlayers}" data-check-in-total="${tournament.players.length}">
    <div class="check-in-heading"><div><p class="kicker">PLAYER CHECK-IN</p><h2>參賽選手名單</h2></div><strong data-check-in-summary>已報到 ${checkedInCount}／報名 ${tournament.players.length} 人</strong></div>
    <p class="check-in-guidance" data-check-in-guidance>${guidance}</p>
    ${tools}
    <div class="check-in-list">${rows || '<div class="check-in-empty">目前沒有參賽選手，可分享私密填寫連結或新增現場選手。</div>'}</div>
    <div class="check-in-empty roster-filter-empty" hidden>找不到符合條件的選手。</div>
    ${dialogs}
  </section>`;
}

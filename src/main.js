/**
 * 前端應用程式進入點。
 * 協調路由、狀態、畫面與事件；賽制規則放在 domain/formats，雲端存取放在 data/store。
 */
import { currentRoute, navigate, onRouteChange } from './core/router.js';
import { rosterPlayerMatches } from './core/roster-filter.js';
import { createTournamentRecord, deleteTournamentRecord, executeTournamentAction, getPublicRegistration, getState, initializeStore, loadTournamentRegistrations, loginAdmin, logoutAdmin, mutateTournament, refreshTournament, refreshTournaments, replaceTournamentRecords, submitPublicRegistration, subscribe, updateRegistrationRecord, updateState, selectTournament, selectMatch, selectEditingTournament } from './data/store.js';
import { duplicateTournament, normalizeTournament, requiredSeedCount } from './domain/tournament.js';
import { exportShareCardAsPng } from './export/share-card-png.js';
import { shell } from './ui/shell.js';
import { homeView } from './views/home.js';
import { guideView } from './views/guide.js';
import { scoreboardView, bindScoreboard } from './views/scoreboard.js';
import { manageView, bindManage } from './views/manage.js';
import { scheduleView } from './views/schedule.js';
import { bindControl, controlView } from './views/control.js';
import { bindDataManagement, dataManagementView } from './views/data-management.js';
import { bindPublicRegistration, registrationView } from './views/registration.js';
import { bindSpeedometer, leaveSpeedometer, speedometerView } from './views/speedometer.js';
import { bindRegistrationAdmin, registrationAdminView } from './views/registration-admin.js';
import { bindDrinkSelectionFields, drinkSelectionFields, readDrinkSelection } from './views/drink-fields.js';

const app = document.querySelector('#app');
let publicRegistrationState = { key: '', loading: false, data: null, error: '', success: false };
let rosterUiState = { tournamentId: null, filter: 'all', query: '', removing: false, selected: new Set() };
let tournamentListUiState = { tab: 'recent', query: '', year: 'all', format: 'all' };
let registrationEntryContext = { source: 'navigation', tournamentId: null };
let toastTimer = null;
let lastRenderedRoute = null;
let scheduleScrollRestore = null;
let checkInSaveQueue = Promise.resolve();

function enqueueCheckInSave(task) {
  const pending = checkInSaveQueue.then(task, task);
  checkInSaveQueue = pending.catch(() => undefined);
  return pending;
}

function checkInInputFor(player) {
  return [...app.querySelectorAll('[data-check-in-player]')]
    .find((input) => input.dataset.checkInPlayer === player) || null;
}

function updateCheckInUi(player, checkedIn) {
  const panel = app.querySelector('.check-in-panel');
  if (!panel) return;
  const input = checkInInputFor(player);
  if (input) input.checked = checkedIn;
  const row = input?.closest('[data-roster-player]');
  if (row) {
    row.dataset.checkedIn = String(checkedIn);
    row.classList.toggle('is-checked-in', checkedIn);
    const status = row.querySelector('i');
    if (status) status.textContent = checkedIn ? '已報到' : '尚未報到';
  }
  const inputs = [...panel.querySelectorAll('[data-check-in-player]')];
  const checkedInCount = inputs.filter((candidate) => candidate.checked).length;
  const total = Number(panel.dataset.checkInTotal) || inputs.length;
  const minimumPlayers = Number(panel.dataset.checkInMinimum) || 2;
  const summary = panel.querySelector('[data-check-in-summary]');
  if (summary) summary.textContent = `已報到 ${checkedInCount}／報名 ${total} 人`;
  const guidance = panel.querySelector('[data-check-in-guidance]');
  if (guidance) guidance.textContent = checkedInCount >= minimumPlayers
    ? '已達開賽人數；未勾選者在開賽時會保留為未出席並排除賽程。'
    : `至少需要 ${minimumPlayers} 位選手完成報到才能開始賽事。`;
  const prepareButton = app.querySelector('[data-action="prepare-tournament-schedule"]');
  if (prepareButton) prepareButton.disabled = checkedInCount < minimumPlayers;
  const allButton = panel.querySelector('[data-check-in-all]');
  if (allButton) allButton.disabled = total > 0 && checkedInCount >= total;
  applyRosterUi();
}

function showToast(message, type = 'success') {
  document.querySelector('.action-toast')?.remove();
  const toast = document.createElement('div');
  toast.className = `action-toast is-${type}`;
  toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
  toast.textContent = message;
  document.body.append(toast);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.remove(), 2600);
}

function registrationUrl(tournamentId, token) {
  return `${location.origin}${location.pathname}#register/${encodeURIComponent(tournamentId)}/${encodeURIComponent(token)}`;
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const input = document.createElement('textarea');
  input.value = text;
  input.setAttribute('readonly', '');
  input.style.position = 'fixed';
  input.style.opacity = '0';
  document.body.append(input);
  input.select();
  document.execCommand('copy');
  input.remove();
}

function render(resetScroll = false) {
  // 每次狀態或網址改變都重新產生畫面，再綁定該頁需要的事件。
  const route = currentRoute();
  // Route changes replace the Speedometer DOM immediately. Release browser
  // resources here rather than waiting for the background polling interval.
  if (lastRenderedRoute === 'speedometer' && route !== 'speedometer') leaveSpeedometer();
  lastRenderedRoute = route;
  const state = getState();
  if (state.loading) {
    app.innerHTML = shell(route, '<section class="section-wrap page-section"><div class="empty-state"><h2>正在載入雲端賽事…</h2><p>請稍候</p></div></section>', state);
    return;
  }
  let view = homeView(state.tournaments.length, state.isAdmin);
  if (route === 'guide') view = guideView(state.isAdmin);
  if (route === 'scoreboard') view = scoreboardView();
  if (route === 'speedometer') view = speedometerView();
  if (route === 'manage') {
    if (!state.isAdmin) {
      view = controlView(false, '請先登入主辦方後台。');
    } else {
      const editingTournament = state.tournaments.find((item) => item.id === state.editingTournamentId) || null;
      view = manageView(editingTournament);
    }
  }
  if (route === 'control') view = controlView(state.isAdmin, state.error);
  if (route === 'data') view = state.isAdmin ? dataManagementView(state.tournaments) : controlView(false, '請先登入主辦方後台。');
  if (route === 'registration') view = state.isAdmin
    ? registrationAdminView(
      state.tournaments,
      state.registrationTournamentId,
      state.registrations,
      registrationEntryContext.source === 'schedule' && registrationEntryContext.tournamentId === state.registrationTournamentId,
    )
    : controlView(false, '請先登入主辦方後台。');
  if (route === 'register') {
    const params = registrationRouteParams();
    const key = params ? `${params.tournamentId}/${params.token}` : '';
    if (key && publicRegistrationState.key !== key) {
      publicRegistrationState = { key, loading: true, data: null, error: '', success: false };
      queueMicrotask(() => loadPublicRegistration(params));
    }
    if (!key) publicRegistrationState = { key: '', loading: false, data: null, error: '報名連結格式不正確。', success: false };
    view = registrationView(publicRegistrationState);
  }
  if (route === 'schedule') {
    const tournament = state.tournaments.find((item) => item.id === state.selectedTournamentId);
    const matchSelection = state.selectedMatch;
    const match = tournament && matchSelection
      ? tournament.rounds?.[matchSelection.roundIndex]?.matches?.[matchSelection.matchIndex]
      : null;
    if (tournament && matchSelection && tournament.status === '進行中' && match?.status === '可開始') {
      view = scoreboardView({
        mode: 'match',
        tournamentName: tournament.name,
        roundName: tournament.rounds[matchSelection.roundIndex].name,
        playerA: match.playerA,
        playerB: match.playerB,
      });
    } else {
      view = scheduleView(state.tournaments, state.selectedTournamentId, state.isAdmin);
    }
  }
  app.innerHTML = shell(route, view, state);
  bindGlobalEvents();
  if (route === 'scoreboard') bindScoreboard(app);
  if (route === 'speedometer') bindSpeedometer(app);
  if (route === 'manage' && state.isAdmin) bindManageEvents(state);
  if (route === 'manage' && !state.isAdmin) bindControlEvents();
  if (route === 'control') bindControlEvents();
  if (route === 'data' && state.isAdmin) bindDataManagementEvents(state);
  if (route === 'data' && !state.isAdmin) bindControlEvents();
  if (route === 'registration' && state.isAdmin) bindRegistrationAdminEvents(state);
  if (route === 'registration' && !state.isAdmin) bindControlEvents();
  if (route === 'register') bindPublicRegistrationEvents();
  if (route === 'schedule') bindScheduleEvents(state);
  if (route === 'schedule' && !state.selectedMatch && scheduleScrollRestore) {
    const position = scheduleScrollRestore;
    scheduleScrollRestore = null;
    requestAnimationFrame(() => window.scrollTo({ top: position.top, left: position.left, behavior: 'auto' }));
  }
  // 雲端同步只更新內容，不把裁判正在查看的位置強制拉回頁首。
  if (resetScroll) scrollPageToTop();
}

function scrollPageToTop() {
  // 使用 auto 與原生 scrollTop 雙重處理，確保手機瀏覽器在切進記分板後立即回到頁首。
  window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  if (document.scrollingElement) document.scrollingElement.scrollTop = 0;
}

function bindDataManagementEvents(state) {
  bindDataManagement(app, state.tournaments, {
    onImport: async (tournaments) => {
      const normalized = tournaments.map(normalizeTournament);
      try {
        await replaceTournamentRecords(normalized);
        selectTournament(null);
        selectEditingTournament(null);
        alert(`已匯入 ${normalized.length} 場賽事並完成雲端同步。`);
        render();
      } catch (error) {
        alert(error.message);
      }
    },
  });
}

function bindRegistrationAdminEvents(state) {
  bindRegistrationAdmin(app, {
    onSelect: async (tournamentId) => {
      try {
        await loadTournamentRegistrations(tournamentId);
      } catch (error) {
        alert(error.message);
      }
    },
    onBack: () => {
      if (registrationEntryContext.source === 'schedule' && registrationEntryContext.tournamentId) {
        const tournamentId = registrationEntryContext.tournamentId;
        registrationEntryContext = { source: 'navigation', tournamentId: null };
        updateState((current) => ({ ...current, registrationTournamentId: null, registrations: [] }));
        selectTournament(tournamentId);
        navigate('schedule');
        return;
      }
      updateState((current) => ({ ...current, registrationTournamentId: null, registrations: [] }));
    },
    onSaveSettings: async (settings) => {
      try {
        const tournamentId = state.registrationTournamentId;
        await executeTournamentAction(tournamentId, 'update_registration_settings', { settings });
      } catch (error) {
        alert(error.message);
      }
    },
    onStatus: async (registrationId, status) => {
      const label = { approved: '核准並加入正式名單', waitlist: '設為候補', rejected: '拒絕' }[status] || status;
      if (!confirm(`確定要將這筆報名「${label}」嗎？`)) return;
      try {
        await updateRegistrationRecord(registrationId, status);
      } catch (error) {
        alert(error.message);
      }
    },
  });
}

function bindPublicRegistrationEvents() {
  const params = registrationRouteParams();
  if (!params) return;
  bindPublicRegistration(app, async (registration) => {
    const result = await submitPublicRegistration(params.tournamentId, params.token, registration);
    publicRegistrationState = { ...publicRegistrationState, loading: false, success: true, error: '', result };
    render();
  });
}

async function loadPublicRegistration(params) {
  try {
    const data = await getPublicRegistration(params.tournamentId, params.token);
    publicRegistrationState = { ...publicRegistrationState, loading: false, data, error: '' };
  } catch (error) {
    publicRegistrationState = { ...publicRegistrationState, loading: false, data: null, error: error.message };
  }
  render();
}

function registrationRouteParams() {
  const match = location.hash.match(/^#register\/([^/]+)\/([^/]+)$/);
  return match ? { tournamentId: decodeURIComponent(match[1]), token: decodeURIComponent(match[2]) } : null;
}

function bindControlEvents() {
  bindControl(app, {
    onLogin: async (pin) => {
      try {
        await loginAdmin(pin);
        navigate('control');
      } catch (error) {
        app.querySelector('.control-error')?.remove();
        const form = app.querySelector('[data-control-login]');
        form?.insertAdjacentHTML('afterbegin', `<div class="control-error">${escapeText(error.message)}</div>`);
        const button = form?.querySelector('button[type="submit"]');
        if (button) { button.disabled = false; button.textContent = '驗證並進入後台'; }
      }
    },
    onLogout: () => {
      logoutAdmin();
      navigate('home');
    },
  });
}

function bindGlobalEvents() {
  app.querySelectorAll('[data-route]').forEach((button) => button.addEventListener('click', () => {
    if (button.dataset.route === 'registration') {
      registrationEntryContext = { source: 'navigation', tournamentId: null };
      updateState((current) => ({ ...current, registrationTournamentId: null, registrations: [] }));
    }
    selectTournament(null);
    selectEditingTournament(null);
    navigate(button.dataset.route);
  }));
  app.querySelector('[data-action="logout-admin"]')?.addEventListener('click', () => {
    logoutAdmin();
    navigate('home');
  });
}

async function addTournament(tournament) {
  try {
    const saved = await createTournamentRecord(tournament);
    selectTournament(saved.id);
    navigate('schedule');
  } catch (error) {
    alert(error.message);
  }
}

function bindManageEvents(state) {
  const editingTournament = state.tournaments.find((item) => item.id === state.editingTournamentId) || null;
  bindManage(app, {
    tournament: editingTournament,
    onSubmit: (tournament) => editingTournament ? saveTournamentChanges(tournament) : addTournament(tournament),
    onCancel: () => {
      selectEditingTournament(null);
      selectTournament(editingTournament?.id || null);
      navigate('schedule');
    },
  });
}

async function saveTournamentChanges(updatedTournament) {
  try {
    const saved = await mutateTournament(updatedTournament.id, (current) => ({ ...updatedTournament, revision: current.revision }));
    selectEditingTournament(null);
    selectTournament(saved.id);
    navigate('schedule');
  } catch (error) {
    alert(error.message);
  }
}

function prepareRosterUi(tournamentId) {
  if (rosterUiState.tournamentId === tournamentId) return;
  rosterUiState = { tournamentId, filter: 'all', query: '', removing: false, selected: new Set() };
}

function applyRosterUi() {
  const panel = app.querySelector('.check-in-panel');
  if (!panel) return;
  panel.classList.toggle('is-remove-mode', rosterUiState.removing);
  const search = panel.querySelector('[data-roster-search]');
  if (search && search.value !== rosterUiState.query) search.value = rosterUiState.query;
  panel.querySelectorAll('[data-roster-filter]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.rosterFilter === rosterUiState.filter);
  });
  let visibleCount = 0;
  panel.querySelectorAll('[data-roster-player]').forEach((row) => {
    const checked = row.dataset.checkedIn === 'true';
    row.hidden = !rosterPlayerMatches(row.dataset.rosterPlayer, checked, rosterUiState.filter, rosterUiState.query);
    if (!row.hidden) visibleCount += 1;
    const selector = row.querySelector('[data-remove-player-select]');
    if (selector) selector.checked = rosterUiState.selected.has(selector.dataset.removePlayerSelect);
  });
  const count = rosterUiState.selected.size;
  const countNode = panel.querySelector('[data-remove-count]');
  const confirmButton = panel.querySelector('[data-confirm-remove-players]');
  if (countNode) countNode.textContent = String(count);
  if (confirmButton) confirmButton.disabled = count === 0;
  const empty = panel.querySelector('.roster-filter-empty');
  if (empty) empty.hidden = visibleCount > 0 || panel.querySelectorAll('[data-roster-player]').length === 0;
}

function bindTournamentListEvents() {
  const root = app.querySelector('[data-tournament-list]');
  if (!root) return;
  root.querySelectorAll('[data-tournament-list-tab]').forEach((button) => button.addEventListener('click', () => {
    tournamentListUiState.tab = button.dataset.tournamentListTab;
    applyTournamentListUi(root);
  }));
  root.querySelector('[data-history-search]')?.addEventListener('input', (event) => {
    tournamentListUiState.query = event.target.value;
    applyTournamentListUi(root);
  });
  root.querySelector('[data-history-year]')?.addEventListener('change', (event) => {
    tournamentListUiState.year = event.target.value;
    applyTournamentListUi(root);
  });
  root.querySelector('[data-history-format]')?.addEventListener('change', (event) => {
    tournamentListUiState.format = event.target.value;
    applyTournamentListUi(root);
  });
  applyTournamentListUi(root);
}

function applyTournamentListUi(root) {
  const tab = tournamentListUiState.tab === 'history' ? 'history' : 'recent';
  root.querySelectorAll('[data-tournament-list-tab]').forEach((button) => {
    const active = button.dataset.tournamentListTab === tab;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', String(active));
  });
  root.querySelectorAll('[data-tournament-list-panel]').forEach((panel) => {
    panel.hidden = panel.dataset.tournamentListPanel !== tab;
  });
  const search = root.querySelector('[data-history-search]');
  const year = root.querySelector('[data-history-year]');
  const format = root.querySelector('[data-history-format]');
  if (search && search.value !== tournamentListUiState.query) search.value = tournamentListUiState.query;
  if (year && [...year.options].some((option) => option.value === tournamentListUiState.year)) year.value = tournamentListUiState.year;
  else tournamentListUiState.year = 'all';
  if (format && [...format.options].some((option) => option.value === tournamentListUiState.format)) format.value = tournamentListUiState.format;
  else tournamentListUiState.format = 'all';
  const query = tournamentListUiState.query.trim().toLocaleLowerCase('zh-TW');
  const rows = [...root.querySelectorAll('[data-history-row]')];
  let visible = 0;
  rows.forEach((row) => {
    const matchesQuery = !query || row.dataset.historySearchText.includes(query);
    const matchesYear = tournamentListUiState.year === 'all' || row.dataset.historyYear === tournamentListUiState.year;
    const matchesFormat = tournamentListUiState.format === 'all' || row.dataset.historyFormat === tournamentListUiState.format;
    row.hidden = !(matchesQuery && matchesYear && matchesFormat);
    if (!row.hidden) visible += 1;
  });
  const count = root.querySelector('[data-history-count]');
  if (count) count.textContent = rows.length ? `顯示 ${visible} / ${rows.length} 場` : '0 場';
  const empty = root.querySelector('[data-history-empty]');
  if (empty) empty.hidden = visible > 0 || rows.length === 0;
}

async function shareRegistration(tournament) {
  const url = registrationUrl(tournament.id, tournament.registrationSettings?.token || '');
  if (navigator.share) {
    try {
      await navigator.share({ title: `${tournament.name} 公開報名`, text: `報名「${tournament.name}」`, url });
      return;
    } catch (error) {
      if (error?.name === 'AbortError') return;
    }
  }
  await copyText(url);
  showToast('報名連結已複製，可以直接貼給選手。');
}

function bindScheduleEvents(state) {
  // selectedMatch 存在時，schedule 路由會暫時顯示正式比賽記分板。
  if (state.selectedMatch) {
    const tournament = state.tournaments.find((item) => item.id === state.selectedTournamentId);
    const { roundIndex, matchIndex } = state.selectedMatch;
    const match = tournament?.rounds?.[roundIndex]?.matches?.[matchIndex];
    if (!tournament || !match || tournament.status !== '進行中' || match.status !== '可開始') {
      selectMatch(null, null);
      render();
      return;
    }
    bindScoreboard(app, {
      playerA: match.playerA,
      playerB: match.playerB,
      onBack: () => { selectMatch(null, null); render(); },
      onComplete: (scoreA, scoreB) => completeMatch(tournament.id, roundIndex, matchIndex, scoreA, scoreB),
      onForfeit: (player) => completeForfeit(tournament.id, roundIndex, matchIndex, player),
    });
    return;
  }
  bindTournamentListEvents();
  prepareRosterUi(state.selectedTournamentId);
  app.querySelectorAll('[data-tournament-id]').forEach((card) => card.addEventListener('click', () => {
    selectTournament(card.dataset.tournamentId);
    render();
  }));
  app.querySelectorAll('[data-delete-tournament]').forEach((button) => button.addEventListener('click', () => {
    const tournamentName = button.dataset.tournamentName;
    if (!confirm(`確定要刪除「${tournamentName}」嗎？\n此賽事的賽程與比分紀錄都會一併移除。`)) return;
    deleteTournament(Number(button.dataset.deleteTournament));
  }));
  app.querySelectorAll('[data-copy-tournament]').forEach((button) => button.addEventListener('click', () => {
    copyTournament(Number(button.dataset.copyTournament));
  }));
  app.querySelectorAll('.match-card.is-ready').forEach((card) => card.addEventListener('click', () => {
    scheduleScrollRestore = { top: window.scrollY, left: window.scrollX };
    selectMatch(card.dataset.roundIndex, card.dataset.matchIndex);
    render(true);
  }));
  app.querySelector('[data-action="edit-tournament"]')?.addEventListener('click', () => {
    selectEditingTournament(state.selectedTournamentId);
    navigate('manage');
  });
  app.querySelector('[data-action="copy-current-tournament"]')?.addEventListener('click', () => {
    copyTournament(state.selectedTournamentId);
  });
  app.querySelectorAll('[data-download-share-card]').forEach((button) => button.addEventListener('click', async (event) => {
    const tournament = state.tournaments.find((item) => item.id === state.selectedTournamentId);
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = '正在產生圖片…';
    try {
      await exportShareCardAsPng(tournament, button.dataset.downloadShareCard);
      button.textContent = '圖片已下載';
    } catch (error) {
      alert(error.message);
      button.disabled = false;
      button.textContent = '下載戰績圖';
    }
  }));
  app.querySelectorAll('[data-close-dialog]').forEach((button) => button.addEventListener('click', () => button.closest('dialog')?.close()));
  bindDrinkSelectionFields(app);
  app.querySelector('[data-open-registration-setup]')?.addEventListener('click', () => app.querySelector('[data-registration-setup-dialog]')?.showModal());
  app.querySelector('[data-open-add-player]')?.addEventListener('click', () => {
    const dialog = app.querySelector('[data-add-player-dialog]');
    dialog?.showModal();
    queueMicrotask(() => dialog?.querySelector('input[name="playerName"]')?.focus());
  });
  app.querySelector('[data-quick-registration-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const tournament = state.tournaments.find((item) => item.id === state.selectedTournamentId);
    const submit = event.currentTarget.querySelector('button[type="submit"]');
    submit.disabled = true;
    submit.textContent = '正在建立…';
    try {
      await executeTournamentAction(tournament.id, 'update_registration_settings', {
        settings: {
          enabled: true,
          capacity: Number(event.currentTarget.elements.capacity.value),
          deadline: event.currentTarget.elements.deadline.value,
        },
      });
      await copyText(registrationUrl(tournament.id, tournament.registrationSettings.token));
      showToast('私密填寫連結已啟用，連結也已複製。');
    } catch (error) {
      showToast(error.message, 'error');
      submit.disabled = false;
      submit.textContent = '啟用並複製連結';
    }
  });
  app.querySelector('[data-share-registration]')?.addEventListener('click', async () => {
    const tournament = state.tournaments.find((item) => item.id === state.selectedTournamentId);
    try {
      await shareRegistration(tournament);
    } catch (error) {
      showToast(`無法分享連結：${error.message}`, 'error');
    }
  });
  app.querySelector('[data-manage-registration]')?.addEventListener('click', async () => {
    try {
      registrationEntryContext = { source: 'schedule', tournamentId: state.selectedTournamentId };
      await loadTournamentRegistrations(state.selectedTournamentId);
      navigate('registration');
    } catch (error) {
      registrationEntryContext = { source: 'navigation', tournamentId: null };
      showToast(error.message, 'error');
    }
  });
  app.querySelector('[data-roster-search]')?.addEventListener('input', (event) => {
    rosterUiState.query = event.currentTarget.value;
    applyRosterUi();
  });
  app.querySelectorAll('[data-roster-filter]').forEach((button) => button.addEventListener('click', () => {
    rosterUiState.filter = button.dataset.rosterFilter;
    applyRosterUi();
  }));
  app.querySelector('[data-enter-remove-mode]')?.addEventListener('click', () => {
    rosterUiState.removing = true;
    rosterUiState.selected.clear();
    applyRosterUi();
  });
  app.querySelector('[data-cancel-remove-mode]')?.addEventListener('click', () => {
    rosterUiState.removing = false;
    rosterUiState.selected.clear();
    applyRosterUi();
  });
  app.querySelectorAll('[data-remove-player-select]').forEach((input) => input.addEventListener('change', () => {
    if (input.checked) rosterUiState.selected.add(input.dataset.removePlayerSelect);
    else rosterUiState.selected.delete(input.dataset.removePlayerSelect);
    applyRosterUi();
  }));
  app.querySelector('[data-confirm-remove-players]')?.addEventListener('click', async () => {
    const players = [...rosterUiState.selected];
    if (!players.length) return;
    const preview = players.length <= 5 ? players.join('、') : `${players.slice(0, 5).join('、')} 等 ${players.length} 位`;
    if (!confirm(`確定要從這場賽事移除「${preview}」嗎？\n移除後，這些選手的報到狀態也會一併刪除。`)) return;
    rosterUiState.removing = false;
    rosterUiState.selected.clear();
    try {
      await executeTournamentAction(state.selectedTournamentId, 'remove_players', { players });
      showToast(`已移除 ${players.length} 位選手。`);
    } catch (error) {
      showToast(error.message, 'error');
    }
  });
  app.querySelector('[data-check-in-all]')?.addEventListener('click', (event) => {
    const button = event.currentTarget;
    const inputs = [...app.querySelectorAll('[data-check-in-player]')];
    if (!inputs.length) return;
    inputs.forEach((input) => updateCheckInUi(input.dataset.checkInPlayer, true));
    button.disabled = true;
    button.textContent = '報到處理中…';
    enqueueCheckInSave(async () => {
      try {
        await executeTournamentAction(state.selectedTournamentId, 'set_all_check_in');
        showToast(`已完成 ${inputs.length} 位選手報到。`);
      } catch (error) {
        showToast(error.message, 'error');
        render();
      }
    });
  });
  app.querySelectorAll('[data-check-in-player]').forEach((input) => input.addEventListener('change', () => {
    const player = input.dataset.checkInPlayer;
    const checkedIn = input.checked;
    updateCheckInUi(player, checkedIn);
    input.disabled = true;
    enqueueCheckInSave(async () => {
      try {
        await executeTournamentAction(state.selectedTournamentId, 'set_check_in', { player, checkedIn });
        updateCheckInUi(player, checkedIn);
        const currentInput = checkInInputFor(player);
        if (currentInput) currentInput.disabled = false;
        showToast(`${player}${checkedIn ? ' 已報到' : ' 已取消報到'}。`);
      } catch (error) {
        updateCheckInUi(player, !checkedIn);
        const currentInput = checkInInputFor(player);
        if (currentInput) currentInput.disabled = false;
        showToast(error.message, 'error');
      }
    });
  }));
  app.querySelector('[data-add-draft-player-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = event.currentTarget.elements.playerName;
    const name = input.value.trim();
    if (!name) return input.focus();
    try {
      const drink = readDrinkSelection(event.currentTarget.querySelector('[data-drink-fields]'));
      await executeTournamentAction(state.selectedTournamentId, 'add_player', {
        player: name,
        details: { phone: event.currentTarget.elements.phone.value, drink },
      });
      showToast(`已將 ${name} 加入參賽名單。`);
    } catch (error) {
      showToast(error.message, 'error');
    }
  });
  app.querySelectorAll('[data-edit-player]').forEach((button) => button.addEventListener('click', () => {
    const tournament = state.tournaments.find((item) => item.id === state.selectedTournamentId);
    const player = button.dataset.editPlayer;
    const details = tournament.participantDetails?.[player] || {};
    const dialog = app.querySelector('[data-edit-player-dialog]');
    const form = dialog.querySelector('[data-edit-draft-player-form]');
    form.elements.originalName.value = player;
    form.elements.playerName.value = player;
    form.elements.phone.value = details.phone || '';
    const slot = form.querySelector('[data-edit-drink-slot]');
    slot.innerHTML = drinkSelectionFields(tournament.drinkSettings, details.drink, { prefix: 'editDrink' });
    bindDrinkSelectionFields(slot);
    dialog.showModal();
  }));
  app.querySelector('[data-edit-draft-player-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const details = { phone: form.elements.phone.value };
    const drink = readDrinkSelection(form.querySelector('[data-drink-fields]'));
    if (drink !== undefined) details.drink = drink;
    try {
      await executeTournamentAction(state.selectedTournamentId, 'update_participant', {
        player: form.elements.originalName.value,
        nextName: form.elements.playerName.value,
        details,
      });
      showToast('參賽資料已更新。');
    } catch (error) {
      showToast(error.message, 'error');
    }
  });
  app.querySelector('[data-copy-drink-summary]')?.addEventListener('click', async (event) => {
    await copyText(event.currentTarget.dataset.copyDrinkSummary);
    showToast('飲品統計已複製。');
  });
  applyRosterUi();
  app.querySelectorAll('[data-replay-round]').forEach((button) => button.addEventListener('click', () => {
    const tournament = state.tournaments.find((item) => item.id === state.selectedTournamentId);
    const roundIndex = Number(button.dataset.replayRound);
    const matchIndex = Number(button.dataset.replayMatch);
    const match = tournament.rounds[roundIndex].matches[matchIndex];
    const hasDownstreamRounds = tournament.rounds.length > roundIndex + 1;
    const warning = hasDownstreamRounds
      ? '\n這場之後已產生的輪次與比賽結果也會一併清除，重新依新勝者產生。'
      : '';
    if (!confirm(`確定要讓「${match.playerA} vs ${match.playerB}」重新比賽嗎？\n該場比分與勝負會清除。${warning}`)) return;
    replayMatch(tournament.id, roundIndex, matchIndex);
  }));
  app.querySelectorAll('[data-withdraw-player], [data-no-show-player]').forEach((button) => button.addEventListener('click', () => {
    const tournament = state.tournaments.find((item) => item.id === state.selectedTournamentId);
    const player = button.dataset.withdrawPlayer || button.dataset.noShowPlayer;
    const status = button.dataset.noShowPlayer ? 'no_show' : 'withdrawn';
    const label = status === 'no_show' ? '未出席' : '中途退賽';
    if (!confirm(`確定將「${player}」標記為${label}嗎？\n若已有尚未進行的對戰，對手將以 4：0 不戰勝。`)) return;
    updateParticipantStatus(tournament.id, player, status);
  }));
  app.querySelector('[data-swiss-qualifier-form]')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const candidates = [...event.currentTarget.querySelectorAll('input[name="candidate"]:checked')].map((input) => input.value);
    if (!confirm(`確定為選取的 ${candidates.length} 位選手建立資格積分決定賽嗎？`)) return;
    beginSwissQualifier(state.selectedTournamentId, candidates);
  });
  app.querySelector('[data-swiss-final-form]')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const finalists = [...event.currentTarget.querySelectorAll('input[name="finalist"]:checked')].map((input) => input.value);
    const mode = event.currentTarget.querySelector('input[name="swissFinalMode"]:checked')?.value;
    const selectedTournament = state.tournaments.find((item) => item.id === state.selectedTournamentId);
    const configuredStage2 = selectedTournament?.swissStage2Config;
    const label = configuredStage2
      ? `第二階段${mode === 'single_elimination' ? '單淘汰賽' : '瑞士輪'}`
      : mode === 'single_elimination' ? '前四單淘汰決賽（含季軍賽）' : '前四循環決賽';
    if (!confirm(`確定由這 ${finalists.length} 位選手進入${label}嗎？`)) return;
    beginSwissFinal(state.selectedTournamentId, finalists, mode);
  });
  app.querySelector('[data-complete-swiss-standings]')?.addEventListener('click', () => {
    if (!confirm('確定以目前瑞士輪積分榜作為最終成績並結束賽事嗎？此操作不會再建立四強賽程。')) return;
    completeSwissByStandings(state.selectedTournamentId);
  });
  app.querySelector('[data-action="complete-tournament-early"]')?.addEventListener('click', async () => {
    if (!confirm('確定要提前結束賽事，依目前勝敗與總得分結算嗎？')) return;
    try { await executeTournamentAction(state.selectedTournamentId, 'complete_tournament_early'); } catch (error) { alert(error.message); }
  });
  app.querySelector('[data-round-robin-tiebreak-form]')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const candidates = [...event.currentTarget.querySelectorAll('input[name="candidate"]:checked')].map((input) => input.value);
    if (!confirm(`確定為選取的 ${candidates.length} 位並列選手建立同分加賽嗎？`)) return;
    beginRoundRobinTieBreak(state.selectedTournamentId, candidates);
  });
  app.querySelectorAll('[data-opening-pairings-form] select').forEach((select) => select.addEventListener('change', () => {
    const form = select.form;
    const selected = [...form.querySelectorAll('select')];
    const duplicate = selected.find((other) => other !== select && other.value === select.value);
    if (!duplicate) return;
    const previous = select.dataset.previousValue || duplicate.dataset.previousValue || '';
    if (previous && previous !== select.value) duplicate.value = previous;
    selected.forEach((item) => { item.dataset.previousValue = item.value; });
  }));
  app.querySelectorAll('[data-opening-pairings-form] select').forEach((select) => { select.dataset.previousValue = select.value; });
  app.querySelector('[data-opening-pairings-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const pairs = [...event.currentTarget.querySelectorAll('[data-pairing-row]')].map((row) => [
      row.querySelector('[name="playerA"]').value,
      row.querySelector('[name="playerB"]').value,
    ]);
    try {
      await executeTournamentAction(state.selectedTournamentId, 'update_opening_pairings', { pairs });
      showToast('首輪對戰已儲存。');
    } catch (error) {
      showToast(error.message, 'error');
    }
  });
  app.querySelector('[data-action="prepare-tournament-schedule"]')?.addEventListener('click', async () => {
    const tournament = state.tournaments.find((item) => item.id === state.selectedTournamentId);
    const checkedInCount = tournament.players.filter((player) => tournament.participantStates?.[player]?.checkedIn).length;
    const absentCount = tournament.players.length - checkedInCount;
    if (!confirm(`確定以 ${checkedInCount} 位已報到選手進入排程階段嗎？\n${absentCount} 位未報到者會標記為未出席；公開報名網址也會立即撤銷。`)) return;
    try {
      await executeTournamentAction(tournament.id, 'prepare_tournament_schedule');
      showToast('報到名單已鎖定，請進行隨機分組。');
    } catch (error) {
      showToast(error.message, 'error');
    }
  });
  app.querySelectorAll('[data-action="randomize-schedule"]').forEach((button) => button.addEventListener('click', async () => {
    const tournament = state.tournaments.find((item) => item.id === state.selectedTournamentId);
    if (tournament.rounds?.length && !confirm('確定要重新隨機分組嗎？目前手動調整的首輪對戰會被取代。')) return;
    try {
      await executeTournamentAction(tournament.id, 'randomize_schedule');
      showToast('隨機分組完成，仍可手動調整對戰。');
    } catch (error) {
      showToast(error.message, 'error');
    }
  }));
  app.querySelector('[data-action="confirm-tournament-schedule"]')?.addEventListener('click', async () => {
    const tournament = state.tournaments.find((item) => item.id === state.selectedTournamentId);
    if (!confirm(`確定使用目前的首輪對戰開始「${tournament.name}」嗎？\n開始後即可由裁判進入節點記分，首輪配對也會鎖定。`)) return;
    try {
      await executeTournamentAction(tournament.id, 'confirm_tournament_schedule');
      showToast('正式賽事已開始。');
    } catch (error) {
      showToast(error.message, 'error');
    }
  });
  app.querySelector('[data-action="start-tournament"]')?.addEventListener('click', () => {
    const tournament = state.tournaments.find((item) => item.id === state.selectedTournamentId);
    const checkedInCount = tournament.players.filter((player) => tournament.participantStates?.[player]?.checkedIn).length;
    const absentCount = tournament.players.length - checkedInCount;
    if (!confirm(`確定開始「${tournament.name}」嗎？\n${checkedInCount} 位已報到選手會進入賽程，${absentCount} 位未報到者會標記為未出席。開始後將鎖定名單。`)) return;
    beginTournament(tournament.id);
  });
  app.querySelector('[data-action="draw-seeds"]')?.addEventListener('click', () => {
    const tournament = state.tournaments.find((item) => item.id === state.selectedTournamentId);
    const isRedraw = tournament.seedPlayerIndexes?.length > 0;
    if (isRedraw && !confirm('確定要重新隨機抽選種子選手嗎？\n目前的種子與預覽賽程會被重新產生。')) return;
    drawSeeds(tournament.id);
  });
  app.querySelector('[data-action="randomize-bracket"]')?.addEventListener('click', () => {
    const tournament = state.tournaments.find((item) => item.id === state.selectedTournamentId);
    const seedWarning = requiredSeedCount(tournament) ? '\n原本抽出的種子也會清除，需要重新抽選。' : '';
    if (!confirm(`確定要重新隨機排列「${tournament.name}」的對戰分組嗎？${seedWarning}`)) return;
    randomizeBracket(tournament.id);
  });
  app.querySelector('[data-action="back-events"]')?.addEventListener('click', () => {
    selectTournament(null);
    render();
  });
}

async function beginSwissQualifier(tournamentId, candidates) {
  try {
    await executeTournamentAction(tournamentId, 'start_swiss_qualifier', { players: candidates });
  } catch (error) {
    alert(error.message);
  }
}

async function beginSwissFinal(tournamentId, finalists, mode) {
  try {
    await executeTournamentAction(tournamentId, 'start_swiss_final', { players: finalists, mode });
  } catch (error) {
    alert(error.message);
  }
}

async function completeSwissByStandings(tournamentId) {
  try {
    await executeTournamentAction(tournamentId, 'complete_swiss_by_standings');
  } catch (error) {
    alert(error.message);
  }
}

async function beginRoundRobinTieBreak(tournamentId, candidates) {
  try {
    await executeTournamentAction(tournamentId, 'start_round_robin_tiebreak', { players: candidates });
  } catch (error) {
    alert(error.message);
  }
}

function escapeText(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

async function drawSeeds(tournamentId) {
  try {
    await executeTournamentAction(tournamentId, 'draw_seeds');
  } catch (error) {
    alert(error.message);
  }
}

async function randomizeBracket(tournamentId) {
  try {
    await executeTournamentAction(tournamentId, 'randomize_bracket');
  } catch (error) {
    alert(error.message);
  }
}

async function beginTournament(tournamentId) {
  try {
    await executeTournamentAction(tournamentId, 'start_tournament');
  } catch (error) {
    alert(error.message);
  }
}

async function deleteTournament(tournamentId) {
  try {
    await deleteTournamentRecord(tournamentId);
    selectTournament(null);
    render();
  } catch (error) {
    alert(error.message);
  }
}

async function copyTournament(tournamentId) {
  try {
    const source = getState().tournaments.find((tournament) => tournament.id === tournamentId);
    if (!source) throw new Error('找不到要複製的賽事。');
    const copy = duplicateTournament(source);
    const saved = await createTournamentRecord(copy);
    selectTournament(saved.id);
    render();
  } catch (error) {
    alert(error.message);
  }
}

async function replayMatch(tournamentId, roundIndex, matchIndex) {
  try {
    await executeTournamentAction(tournamentId, 'replay_match', { roundIndex, matchIndex });
    selectMatch(null, null);
    render();
  } catch (error) {
    alert(error.message);
  }
}

async function completeMatch(tournamentId, roundIndex, matchIndex, scoreA, scoreB) {
  try {
    await executeTournamentAction(tournamentId, 'record_match', { roundIndex, matchIndex, scoreA, scoreB });
    selectMatch(null, null);
    render();
  } catch (error) {
    selectMatch(null, null);
    render();
    alert(error.message);
  }
}

async function completeForfeit(tournamentId, roundIndex, matchIndex, player) {
  try {
    await executeTournamentAction(tournamentId, 'forfeit_match', { roundIndex, matchIndex, player });
    selectMatch(null, null);
    render();
  } catch (error) {
    selectMatch(null, null);
    render();
    alert(error.message);
  }
}

async function updateParticipantStatus(tournamentId, player, status) {
  try {
    await executeTournamentAction(tournamentId, 'withdraw_player', { player, status });
  } catch (error) {
    alert(error.message);
  }
}

function migrateTournamentData() {
  if (!getState().isAdmin) return;
  const current = getState();
  const tournaments = current.tournaments.map(normalizeTournament);
  const changed = tournaments.some((tournament, index) =>
    JSON.stringify(tournament) !== JSON.stringify(current.tournaments[index]));
  if (changed) updateState((latest) => ({ ...latest, tournaments }));
}

let renderQueued = false;
let resetScrollOnRender = false;

function requestRender(resetScroll = false) {
  resetScrollOnRender ||= resetScroll;
  if (renderQueued) return;
  renderQueued = true;
  queueMicrotask(() => {
    renderQueued = false;
    const shouldResetScroll = resetScrollOnRender;
    resetScrollOnRender = false;
    render(shouldResetScroll);
  });
}

onRouteChange(() => requestRender(true));
subscribe(() => requestRender());
await initializeStore();
migrateTournamentData();
requestRender();

let pollTimer = null;

async function pollForUpdates() {
  clearTimeout(pollTimer);
  const route = currentRoute();
  const current = getState();
  let delay = 15_000;

  if (document.visibilityState === 'visible') {
    // 賽程頁只抓目前賽事；首頁才抓完整清單。ETag 未變時不下載 JSON。
    if (route === 'schedule' && current.selectedTournamentId && !current.selectedMatch) {
      await refreshTournament(current.selectedTournamentId);
      delay = 4_000;
    } else if (route === 'home') {
      await refreshTournaments();
    }
  } else {
    delay = 30_000;
  }

  pollTimer = setTimeout(pollForUpdates, delay);
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  clearTimeout(pollTimer);
  pollForUpdates();
});

pollTimer = setTimeout(pollForUpdates, 4_000);

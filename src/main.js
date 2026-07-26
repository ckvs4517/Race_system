/**
 * 前端應用程式進入點。
 * 協調路由、狀態、畫面與事件；賽制規則放在 domain/formats，雲端存取放在 data/store。
 */
import { currentRoute, navigate, onRouteChange } from './core/router.js';
import { createTournamentRecord, deleteTournamentRecord, executeTournamentAction, getPublicRegistration, getState, initializeStore, loadTournamentRegistrations, loginAdmin, logoutAdmin, mutateTournament, refreshTournament, refreshTournaments, replaceTournamentRecords, submitPublicRegistration, subscribe, updateRegistrationRecord, updateState, selectTournament, selectMatch, selectEditingTournament } from './data/store.js';
import { duplicateTournament, normalizeTournament, requiredSeedCount } from './domain/tournament.js';
import { downloadTournamentImage } from './export/tournament-image.js';
import { shell } from './ui/shell.js';
import { homeView } from './views/home.js';
import { guideView } from './views/guide.js';
import { scoreboardView, bindScoreboard } from './views/scoreboard.js';
import { manageView, bindManage } from './views/manage.js';
import { scheduleView } from './views/schedule.js';
import { bindControl, controlView } from './views/control.js';
import { bindDataManagement, dataManagementView } from './views/data-management.js';
import { bindPublicRegistration, registrationView } from './views/registration.js';
import { bindRegistrationAdmin, registrationAdminView } from './views/registration-admin.js';

const app = document.querySelector('#app');
let publicRegistrationState = { key: '', loading: false, data: null, error: '', success: false };
let rosterUiState = { tournamentId: null, filter: 'all', query: '', removing: false, selected: new Set() };
let registrationEntryContext = { source: 'navigation', tournamentId: null };
let toastTimer = null;

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
  const state = getState();
  if (state.loading) {
    app.innerHTML = shell(route, '<section class="section-wrap page-section"><div class="empty-state"><h2>正在載入雲端賽事…</h2><p>請稍候</p></div></section>', state);
    return;
  }
  let view = homeView(state.tournaments.length, state.isAdmin);
  if (route === 'guide') view = guideView(state.isAdmin);
  if (route === 'scoreboard') view = scoreboardView();
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
    if (tournament && matchSelection) {
      const match = tournament.rounds[matchSelection.roundIndex].matches[matchSelection.matchIndex];
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
  if (route === 'manage' && state.isAdmin) bindManageEvents(state);
  if (route === 'manage' && !state.isAdmin) bindControlEvents();
  if (route === 'control') bindControlEvents();
  if (route === 'data' && state.isAdmin) bindDataManagementEvents(state);
  if (route === 'data' && !state.isAdmin) bindControlEvents();
  if (route === 'registration' && state.isAdmin) bindRegistrationAdminEvents(state);
  if (route === 'registration' && !state.isAdmin) bindControlEvents();
  if (route === 'register') bindPublicRegistrationEvents();
  if (route === 'schedule') bindScheduleEvents(state);
  // 雲端同步只更新內容，不把裁判正在查看的位置強制拉回頁首。
  if (resetScroll) window.scrollTo({ top: 0, behavior: 'instant' });
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
    await submitPublicRegistration(params.tournamentId, params.token, registration);
    publicRegistrationState = { ...publicRegistrationState, loading: false, success: true, error: '' };
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
    const nameMatches = row.dataset.rosterPlayer.toLocaleLowerCase('zh-Hant').includes(rosterUiState.query.toLocaleLowerCase('zh-Hant'));
    const checked = row.dataset.checkedIn === 'true';
    const stateMatches = rosterUiState.filter === 'all'
      || (rosterUiState.filter === 'checked' && checked)
      || (rosterUiState.filter === 'unchecked' && !checked);
    row.hidden = !(nameMatches && stateMatches);
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
    const match = tournament.rounds[roundIndex].matches[matchIndex];
    bindScoreboard(app, {
      playerA: match.playerA,
      playerB: match.playerB,
      onBack: () => { selectMatch(null, null); render(); },
      onComplete: (scoreA, scoreB) => completeMatch(tournament.id, roundIndex, matchIndex, scoreA, scoreB),
      onForfeit: (player) => completeForfeit(tournament.id, roundIndex, matchIndex, player),
    });
    return;
  }
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
    selectMatch(card.dataset.roundIndex, card.dataset.matchIndex);
    render();
  }));
  app.querySelector('[data-action="edit-tournament"]')?.addEventListener('click', () => {
    selectEditingTournament(state.selectedTournamentId);
    navigate('manage');
  });
  app.querySelector('[data-action="copy-current-tournament"]')?.addEventListener('click', () => {
    copyTournament(state.selectedTournamentId);
  });
  app.querySelector('[data-action="download-tournament-image"]')?.addEventListener('click', async (event) => {
    const tournament = state.tournaments.find((item) => item.id === state.selectedTournamentId);
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = '正在產生圖片…';
    try {
      await downloadTournamentImage(tournament);
      button.textContent = '圖片已下載';
    } catch (error) {
      alert(error.message);
      button.disabled = false;
      button.textContent = '下載完整賽程圖';
    }
  });
  app.querySelectorAll('[data-close-dialog]').forEach((button) => button.addEventListener('click', () => button.closest('dialog')?.close()));
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
      showToast('公開報名已開放，連結也已複製。');
    } catch (error) {
      showToast(error.message, 'error');
      submit.disabled = false;
      submit.textContent = '開放報名並複製連結';
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
  app.querySelectorAll('[data-check-in-player]').forEach((input) => input.addEventListener('change', async () => {
    const player = input.dataset.checkInPlayer;
    const checkedIn = input.checked;
    input.disabled = true;
    try {
      await executeTournamentAction(state.selectedTournamentId, 'set_check_in', { player, checkedIn });
      showToast(`${player}${checkedIn ? ' 已報到' : ' 已取消報到'}。`);
    } catch (error) {
      showToast(error.message, 'error');
      render();
    }
  }));
  app.querySelector('[data-add-draft-player-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = event.currentTarget.elements.playerName;
    const name = input.value.trim();
    if (!name) return input.focus();
    try {
      await executeTournamentAction(state.selectedTournamentId, 'add_player', { player: name });
      showToast(`已將 ${name} 加入參賽名單。`);
    } catch (error) {
      showToast(error.message, 'error');
    }
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
    if (!confirm(`確定由這 ${finalists.length} 位選手進入前四循環決賽嗎？`)) return;
    beginSwissFinal(state.selectedTournamentId, finalists);
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

async function beginSwissFinal(tournamentId, finalists) {
  try {
    await executeTournamentAction(tournamentId, 'start_swiss_final', { players: finalists });
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

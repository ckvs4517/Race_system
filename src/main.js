/**
 * 前端應用程式進入點。
 * 協調路由、狀態、畫面與事件；賽制規則放在 domain/formats，雲端存取放在 data/store。
 */
import { currentRoute, navigate, onRouteChange } from './core/router.js';
import { getState, initializeStore, refreshTournament, refreshTournaments, selectEditingTournament, selectTournament, subscribe, updateState } from './data/store.js';
import { normalizeTournament } from './domain/tournament.js';
import { shell } from './ui/shell.js';
import { homeView } from './views/home.js';
import { guideView } from './views/guide.js';
import { scoreboardView, bindScoreboard } from './views/scoreboard.js';
import { manageView } from './views/manage.js';
import { scheduleView } from './views/schedule.js';
import { controlView } from './views/control.js';
import { dataManagementView } from './views/data-management.js';
import { registrationView } from './views/registration.js';
import { bindSpeedometer, leaveSpeedometer, speedometerView } from './views/speedometer.js';
import { registrationAdminView } from './views/registration-admin.js';
import { bindControlController, logoutAndGoHome } from './features/control/controller.js';
import { bindDataManagementController } from './features/data-management/controller.js';
import {
  bindPublicRegistrationController,
  bindRegistrationAdminController,
  isScheduleRegistrationEntry,
  openRegistrationAdminFromSchedule,
  resetRegistrationNavigationContext,
  syncPublicRegistrationRoute,
} from './features/registration/controller.js';
import { bindScheduleController } from './features/schedule/controller.js';
import { bindTournamentManagementController } from './features/tournament-management/controller.js';

const app = document.querySelector('#app');
let lastRenderedRoute = null;

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
      isScheduleRegistrationEntry(state.registrationTournamentId),
    )
    : controlView(false, '請先登入主辦方後台。');
  if (route === 'register') view = registrationView(syncPublicRegistrationRoute(requestRender));
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
  if (route === 'manage' && state.isAdmin) bindTournamentManagementController(app, state);
  if (route === 'manage' && !state.isAdmin) bindControlController(app);
  if (route === 'control') bindControlController(app);
  if (route === 'data' && state.isAdmin) bindDataManagementController(app, state, requestRender);
  if (route === 'data' && !state.isAdmin) bindControlController(app);
  if (route === 'registration' && state.isAdmin) bindRegistrationAdminController(app, state);
  if (route === 'registration' && !state.isAdmin) bindControlController(app);
  if (route === 'register') bindPublicRegistrationController(app, requestRender);
  if (route === 'schedule') bindScheduleController(app, state, { requestRender, openRegistrationAdmin: openRegistrationAdminFromSchedule });
  // 雲端同步只更新內容，不把裁判正在查看的位置強制拉回頁首。
  if (resetScroll) scrollPageToTop();
}

function scrollPageToTop() {
  // 使用 auto 與原生 scrollTop 雙重處理，確保手機瀏覽器在切進記分板後立即回到頁首。
  window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  if (document.scrollingElement) document.scrollingElement.scrollTop = 0;
}

function bindGlobalEvents() {
  app.querySelectorAll('[data-route]').forEach((button) => button.addEventListener('click', () => {
    if (button.dataset.route === 'registration') resetRegistrationNavigationContext();
    selectTournament(null);
    selectEditingTournament(null);
    navigate(button.dataset.route);
  }));
  app.querySelector('[data-action="logout-admin"]')?.addEventListener('click', () => logoutAndGoHome());
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

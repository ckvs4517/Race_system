import { currentRoute, navigate, onRouteChange } from './core/router.js';
import { getState, initializeStore, loginAdmin, logoutAdmin, subscribe, updateState, selectTournament, selectMatch, selectEditingTournament } from './data/store.js';
import { drawRandomSeeds, duplicateTournament, normalizeTournament, randomizeDraftTournament, recordMatchResult, requiredSeedCount, resetCompletedMatch, startTournament } from './domain/tournament.js';
import { shell } from './ui/shell.js';
import { homeView } from './views/home.js';
import { scoreboardView, bindScoreboard } from './views/scoreboard.js';
import { manageView, bindManage } from './views/manage.js';
import { scheduleView } from './views/schedule.js';
import { bindControl, controlView } from './views/control.js';
import { bindDataManagement, dataManagementView } from './views/data-management.js';

const app = document.querySelector('#app');

function render() {
  const route = currentRoute();
  const state = getState();
  if (state.loading) {
    app.innerHTML = shell(route, '<section class="section-wrap page-section"><div class="empty-state"><h2>正在載入雲端賽事…</h2><p>請稍候</p></div></section>', state);
    return;
  }
  let view = homeView(state.tournaments.length, state.isAdmin);
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
  if (route === 'schedule') bindScheduleEvents(state);
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function bindDataManagementEvents(state) {
  bindDataManagement(app, state.tournaments, {
    onImport: (tournaments) => {
      const normalized = tournaments.map(normalizeTournament);
      updateState((current) => ({
        ...current,
        tournaments: normalized,
        selectedTournamentId: null,
        selectedMatch: null,
        editingTournamentId: null,
      }));
      alert(`已匯入 ${normalized.length} 場賽事，正在同步至雲端。`);
      render();
    },
  });
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
    selectTournament(null);
    selectEditingTournament(null);
    navigate(button.dataset.route);
  }));
  app.querySelector('[data-action="logout-admin"]')?.addEventListener('click', () => {
    logoutAdmin();
    navigate('home');
  });
}

function addTournament(tournament) {
  tournament = randomizeDraftTournament(tournament);
  updateState((state) => ({ ...state, tournaments: [tournament, ...state.tournaments], selectedTournamentId: tournament.id }));
  selectTournament(tournament.id);
  navigate('schedule');
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

function saveTournamentChanges(updatedTournament) {
  updateState((state) => ({
    ...state,
    tournaments: state.tournaments.map((tournament) => tournament.id === updatedTournament.id ? updatedTournament : tournament),
    editingTournamentId: null,
    selectedTournamentId: updatedTournament.id,
  }));
  selectEditingTournament(null);
  selectTournament(updatedTournament.id);
  navigate('schedule');
}

function bindScheduleEvents(state) {
  if (state.selectedMatch) {
    const tournament = state.tournaments.find((item) => item.id === state.selectedTournamentId);
    const { roundIndex, matchIndex } = state.selectedMatch;
    const match = tournament.rounds[roundIndex].matches[matchIndex];
    bindScoreboard(app, {
      playerA: match.playerA,
      playerB: match.playerB,
      onBack: () => { selectMatch(null, null); render(); },
      onComplete: (scoreA, scoreB) => completeMatch(tournament.id, roundIndex, matchIndex, scoreA, scoreB),
    });
    return;
  }
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
  app.querySelector('[data-action="start-tournament"]')?.addEventListener('click', () => {
    const tournament = state.tournaments.find((item) => item.id === state.selectedTournamentId);
    if (!confirm(`確定開始「${tournament.name}」嗎？\n開始後將鎖定 ${tournament.players.length} 位參賽者，無法再編輯名單。`)) return;
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

function escapeText(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function drawSeeds(tournamentId) {
  try {
    updateState((state) => ({
      ...state,
      tournaments: state.tournaments.map((tournament) => tournament.id === tournamentId
        ? drawRandomSeeds(tournament)
        : tournament),
    }));
    render();
  } catch (error) {
    alert(error.message);
  }
}

function randomizeBracket(tournamentId) {
  try {
    updateState((state) => ({
      ...state,
      tournaments: state.tournaments.map((tournament) => tournament.id === tournamentId
        ? randomizeDraftTournament(tournament)
        : tournament),
    }));
    render();
  } catch (error) {
    alert(error.message);
  }
}

function beginTournament(tournamentId) {
  try {
    updateState((state) => ({
      ...state,
      tournaments: state.tournaments.map((tournament) => tournament.id === tournamentId
        ? startTournament(tournament)
        : tournament),
    }));
    render();
  } catch (error) {
    alert(error.message);
  }
}

function deleteTournament(tournamentId) {
  updateState((state) => ({
    ...state,
    tournaments: state.tournaments.filter((tournament) => tournament.id !== tournamentId),
    selectedTournamentId: null,
    selectedMatch: null,
    editingTournamentId: null,
  }));
  selectTournament(null);
  render();
}

function copyTournament(tournamentId) {
  try {
    const source = getState().tournaments.find((tournament) => tournament.id === tournamentId);
    if (!source) throw new Error('找不到要複製的賽事。');
    const copy = duplicateTournament(source);
    updateState((state) => ({
      ...state,
      tournaments: [copy, ...state.tournaments],
      selectedTournamentId: copy.id,
      selectedMatch: null,
      editingTournamentId: null,
    }));
    selectTournament(copy.id);
    render();
  } catch (error) {
    alert(error.message);
  }
}

function replayMatch(tournamentId, roundIndex, matchIndex) {
  try {
    updateState((state) => ({
      ...state,
      selectedMatch: null,
      tournaments: state.tournaments.map((tournament) => tournament.id === tournamentId
        ? resetCompletedMatch(tournament, roundIndex, matchIndex)
        : tournament),
    }));
    selectMatch(null, null);
    render();
  } catch (error) {
    alert(error.message);
  }
}

function completeMatch(tournamentId, roundIndex, matchIndex, scoreA, scoreB) {
  try {
    updateState((state) => ({
      ...state,
      tournaments: state.tournaments.map((tournament) => tournament.id === tournamentId
        ? recordMatchResult(tournament, roundIndex, matchIndex, scoreA, scoreB)
        : tournament),
    }));
    selectMatch(null, null);
    render();
  } catch (error) {
    alert(error.message);
  }
}

function migrateTournamentData() {
  if (!getState().isAdmin) return;
  updateState((current) => ({
    ...current,
    tournaments: current.tournaments.map(normalizeTournament),
  }));
}

onRouteChange(render);
subscribe(render);
await initializeStore();
migrateTournamentData();
render();

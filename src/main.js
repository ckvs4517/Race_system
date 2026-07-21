import { currentRoute, navigate, onRouteChange } from './core/router.js';
import { getState, updateState, selectTournament, selectMatch } from './data/store.js';
import { normalizeTournament, recordMatchResult } from './domain/tournament.js';
import { shell } from './ui/shell.js';
import { homeView } from './views/home.js';
import { scoreboardView, bindScoreboard } from './views/scoreboard.js';
import { manageView, bindManage } from './views/manage.js';
import { scheduleView } from './views/schedule.js';

const app = document.querySelector('#app');

function render() {
  const route = currentRoute();
  const state = getState();
  let view = homeView(state.tournaments.length);
  if (route === 'scoreboard') view = scoreboardView();
  if (route === 'manage') view = manageView();
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
      view = scheduleView(state.tournaments, state.selectedTournamentId);
    }
  }
  app.innerHTML = shell(route, view);
  bindGlobalEvents();
  if (route === 'scoreboard') bindScoreboard(app);
  if (route === 'manage') bindManage(app, addTournament);
  if (route === 'schedule') bindScheduleEvents(state);
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function bindGlobalEvents() {
  app.querySelectorAll('[data-route]').forEach((button) => button.addEventListener('click', () => {
    selectTournament(null);
    navigate(button.dataset.route);
  }));
}

function addTournament(tournament) {
  updateState((state) => ({ ...state, tournaments: [tournament, ...state.tournaments], selectedTournamentId: tournament.id }));
  selectTournament(tournament.id);
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
  app.querySelectorAll('.match-card.is-ready').forEach((card) => card.addEventListener('click', () => {
    selectMatch(card.dataset.roundIndex, card.dataset.matchIndex);
    render();
  }));
  app.querySelector('[data-action="back-events"]')?.addEventListener('click', () => {
    selectTournament(null);
    render();
  });
}

function deleteTournament(tournamentId) {
  updateState((state) => ({
    ...state,
    tournaments: state.tournaments.filter((tournament) => tournament.id !== tournamentId),
    selectedTournamentId: null,
    selectedMatch: null,
  }));
  selectTournament(null);
  render();
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
  const state = getState();
  if (!state.tournaments.some((tournament) => !Array.isArray(tournament.rounds))) return;
  updateState((current) => ({
    ...current,
    tournaments: current.tournaments.map(normalizeTournament),
  }));
}

onRouteChange(render);
migrateTournamentData();
render();

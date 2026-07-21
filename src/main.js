import { currentRoute, navigate, onRouteChange } from './core/router.js';
import { getState, updateState, selectTournament } from './data/store.js';
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
  if (route === 'schedule') view = scheduleView(state.tournaments, state.selectedTournamentId);
  app.innerHTML = shell(route, view);
  bindGlobalEvents();
  if (route === 'scoreboard') bindScoreboard(app);
  if (route === 'manage') bindManage(app, addTournament);
  if (route === 'schedule') bindScheduleEvents();
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

function bindScheduleEvents() {
  app.querySelectorAll('[data-tournament-id]').forEach((card) => card.addEventListener('click', () => {
    selectTournament(card.dataset.tournamentId);
    render();
  }));
  app.querySelector('[data-action="back-events"]')?.addEventListener('click', () => {
    selectTournament(null);
    render();
  });
}

onRouteChange(render);
render();

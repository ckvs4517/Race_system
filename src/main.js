/**
 * 前端應用程式進入點。
 * 協調路由、狀態、畫面與事件；賽制規則放在 domain/formats，雲端存取放在 data/store。
 */
import { currentRoute, navigate, onRouteChange } from './core/router.js';
import { createTournamentRecord, deleteTournamentRecord, getState, initializeStore, loginAdmin, logoutAdmin, mutateTournament, refreshTournaments, replaceTournamentRecords, subscribe, updateState, selectTournament, selectMatch, selectEditingTournament } from './data/store.js';
import { drawRandomSeeds, duplicateTournament, forfeitMatch, normalizeTournament, randomizeDraftTournament, recordMatchResult, requiredSeedCount, resetCompletedMatch, startTournament, withdrawPlayer } from './domain/tournament.js';
import { shell } from './ui/shell.js';
import { homeView } from './views/home.js';
import { scoreboardView, bindScoreboard } from './views/scoreboard.js';
import { manageView, bindManage } from './views/manage.js';
import { scheduleView } from './views/schedule.js';
import { bindControl, controlView } from './views/control.js';
import { bindDataManagement, dataManagementView } from './views/data-management.js';

const app = document.querySelector('#app');

function render() {
  // 每次狀態或網址改變都重新產生畫面，再綁定該頁需要的事件。
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

async function addTournament(tournament) {
  tournament = randomizeDraftTournament(tournament);
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
  app.querySelectorAll('[data-withdraw-player], [data-no-show-player]').forEach((button) => button.addEventListener('click', () => {
    const tournament = state.tournaments.find((item) => item.id === state.selectedTournamentId);
    const player = button.dataset.withdrawPlayer || button.dataset.noShowPlayer;
    const status = button.dataset.noShowPlayer ? 'no_show' : 'withdrawn';
    const label = status === 'no_show' ? '未出席' : '中途退賽';
    if (!confirm(`確定將「${player}」標記為${label}嗎？\n若已有尚未進行的對戰，對手將以 4：0 不戰勝。`)) return;
    updateParticipantStatus(tournament.id, player, status);
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

async function drawSeeds(tournamentId) {
  try {
    await mutateTournament(tournamentId, drawRandomSeeds);
    render();
  } catch (error) {
    alert(error.message);
  }
}

async function randomizeBracket(tournamentId) {
  try {
    await mutateTournament(tournamentId, randomizeDraftTournament);
    render();
  } catch (error) {
    alert(error.message);
  }
}

async function beginTournament(tournamentId) {
  try {
    await mutateTournament(tournamentId, startTournament);
    render();
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
    await mutateTournament(tournamentId, (tournament) => resetCompletedMatch(tournament, roundIndex, matchIndex));
    selectMatch(null, null);
    render();
  } catch (error) {
    alert(error.message);
  }
}

async function completeMatch(tournamentId, roundIndex, matchIndex, scoreA, scoreB) {
  try {
    await mutateTournament(
      tournamentId,
      (tournament) => recordMatchResult(tournament, roundIndex, matchIndex, scoreA, scoreB),
      { retryOnConflict: true },
    );
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
    await mutateTournament(
      tournamentId,
      (tournament) => forfeitMatch(tournament, roundIndex, matchIndex, player),
      { retryOnConflict: true },
    );
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
    await mutateTournament(tournamentId, (tournament) => withdrawPlayer(tournament, player, status), { retryOnConflict: true });
    render();
  } catch (error) {
    render();
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

setInterval(() => {
  // 記分與編輯期間不輪詢，避免裁判尚未送出的內容被畫面更新蓋掉。
  const route = currentRoute();
  const current = getState();
  if (document.visibilityState !== 'visible' || route === 'scoreboard' || route === 'manage' || current.selectedMatch) return;
  refreshTournaments();
}, 3000);

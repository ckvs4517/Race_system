/**
 * 賽程 feature controller。
 * 管理賽程頁的 DOM interaction 與操作協調；賽制規則仍由 domain/formats 決定。
 */
import { navigate } from '../../core/router.js';
import { rosterPlayerMatches } from '../../core/roster-filter.js';
import {
  createTournamentRecord,
  deleteTournamentRecord,
  executeTournamentAction,
  getState,
  selectEditingTournament,
  selectMatch,
  selectTournament,
} from '../../data/store.js';
import { duplicateTournament, requiredSeedCount } from '../../domain/tournament.js';
import { exportShareCardAsPng } from '../../export/share-card-png.js';
import { copyText } from '../../ui/clipboard.js';
import { showToast } from '../../ui/toast.js';
import { bindDrinkSelectionFields, drinkSelectionFields, readDrinkSelection } from '../../views/drink-fields.js';
import { bindScoreboard } from '../../views/scoreboard.js';
import { registrationUrl } from '../registration/url.js';

let rosterUiState = { tournamentId: null, filter: 'all', query: '', removing: false, selected: new Set() };
let tournamentListUiState = { tab: 'recent', query: '', year: 'all', format: 'all' };
let scheduleScrollRestore = null;

export function bindScheduleController(root, state, { requestRender, openRegistrationAdmin }) {
  // selectedMatch 存在時，schedule 路由會暫時顯示正式比賽記分板。
  if (state.selectedMatch) {
    const tournament = state.tournaments.find((item) => item.id === state.selectedTournamentId);
    const { roundIndex, matchIndex } = state.selectedMatch;
    const match = tournament?.rounds?.[roundIndex]?.matches?.[matchIndex];
    if (!tournament || !match || tournament.status !== '進行中' || match.status !== '可開始') {
      selectMatch(null, null);
      requestRender();
      return;
    }
    bindScoreboard(root, {
      playerA: match.playerA,
      playerB: match.playerB,
      onBack: () => { selectMatch(null, null); requestRender(); },
      onComplete: (scoreA, scoreB) => completeMatch(tournament.id, roundIndex, matchIndex, scoreA, scoreB, requestRender),
      onForfeit: (player) => completeForfeit(tournament.id, roundIndex, matchIndex, player, requestRender),
    });
    return;
  }

  bindTournamentListEvents(root);
  prepareRosterUi(state.selectedTournamentId);

  root.querySelectorAll('[data-tournament-id]').forEach((card) => card.addEventListener('click', () => {
    selectTournament(card.dataset.tournamentId);
    requestRender();
  }));
  root.querySelectorAll('[data-delete-tournament]').forEach((button) => button.addEventListener('click', () => {
    const tournamentName = button.dataset.tournamentName;
    if (!confirm(`確定要刪除「${tournamentName}」嗎？\n此賽事的賽程與比分紀錄都會一併移除。`)) return;
    deleteTournament(Number(button.dataset.deleteTournament), requestRender);
  }));
  root.querySelectorAll('[data-copy-tournament]').forEach((button) => button.addEventListener('click', () => {
    copyTournament(Number(button.dataset.copyTournament), requestRender);
  }));
  root.querySelectorAll('.match-card.is-ready').forEach((card) => card.addEventListener('click', () => {
    scheduleScrollRestore = { top: window.scrollY, left: window.scrollX };
    selectMatch(card.dataset.roundIndex, card.dataset.matchIndex);
    requestRender(true);
  }));
  root.querySelector('[data-action="edit-tournament"]')?.addEventListener('click', () => {
    selectEditingTournament(state.selectedTournamentId);
    navigate('manage');
  });
  root.querySelector('[data-action="copy-current-tournament"]')?.addEventListener('click', () => {
    copyTournament(state.selectedTournamentId, requestRender);
  });
  root.querySelectorAll('[data-download-share-card]').forEach((button) => button.addEventListener('click', async (event) => {
    const tournament = state.tournaments.find((item) => item.id === state.selectedTournamentId);
    const target = event.currentTarget;
    target.disabled = true;
    target.textContent = '正在產生圖片…';
    try {
      await exportShareCardAsPng(tournament, target.dataset.downloadShareCard);
      target.textContent = '圖片已下載';
    } catch (error) {
      alert(error.message);
      target.disabled = false;
      target.textContent = '下載戰績圖';
    }
  }));
  root.querySelectorAll('[data-close-dialog]').forEach((button) => button.addEventListener('click', () => button.closest('dialog')?.close()));
  bindDrinkSelectionFields(root);
  root.querySelector('[data-open-registration-setup]')?.addEventListener('click', () => root.querySelector('[data-registration-setup-dialog]')?.showModal());
  root.querySelector('[data-open-add-player]')?.addEventListener('click', () => {
    const dialog = root.querySelector('[data-add-player-dialog]');
    dialog?.showModal();
    queueMicrotask(() => dialog?.querySelector('input[name="playerName"]')?.focus());
  });
  root.querySelector('[data-quick-registration-form]')?.addEventListener('submit', async (event) => {
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
  root.querySelector('[data-share-registration]')?.addEventListener('click', async () => {
    const tournament = state.tournaments.find((item) => item.id === state.selectedTournamentId);
    try {
      await shareRegistration(tournament);
    } catch (error) {
      showToast(`無法分享連結：${error.message}`, 'error');
    }
  });
  root.querySelector('[data-manage-registration]')?.addEventListener('click', async () => {
    try {
      await openRegistrationAdmin(state.selectedTournamentId);
    } catch (error) {
      showToast(error.message, 'error');
    }
  });

  bindRosterEvents(root, state, requestRender);
  bindMatchAdministration(root, state, requestRender);
  bindTournamentLifecycle(root, state, requestRender);
  applyRosterUi(root);
  restoreScheduleScroll();
}

function bindRosterEvents(root, state, requestRender) {
  root.querySelector('[data-roster-search]')?.addEventListener('input', (event) => {
    rosterUiState.query = event.currentTarget.value;
    applyRosterUi(root);
  });
  root.querySelectorAll('[data-roster-filter]').forEach((button) => button.addEventListener('click', () => {
    rosterUiState.filter = button.dataset.rosterFilter;
    applyRosterUi(root);
  }));
  root.querySelector('[data-enter-remove-mode]')?.addEventListener('click', () => {
    rosterUiState.removing = true;
    rosterUiState.selected.clear();
    applyRosterUi(root);
  });
  root.querySelector('[data-cancel-remove-mode]')?.addEventListener('click', () => {
    rosterUiState.removing = false;
    rosterUiState.selected.clear();
    applyRosterUi(root);
  });
  root.querySelectorAll('[data-remove-player-select]').forEach((input) => input.addEventListener('change', () => {
    if (input.checked) rosterUiState.selected.add(input.dataset.removePlayerSelect);
    else rosterUiState.selected.delete(input.dataset.removePlayerSelect);
    applyRosterUi(root);
  }));
  root.querySelector('[data-confirm-remove-players]')?.addEventListener('click', async () => {
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
  root.querySelectorAll('[data-check-in-player]').forEach((input) => input.addEventListener('change', async () => {
    const player = input.dataset.checkInPlayer;
    const checkedIn = input.checked;
    input.disabled = true;
    try {
      await executeTournamentAction(state.selectedTournamentId, 'set_check_in', { player, checkedIn });
      showToast(`${player}${checkedIn ? ' 已報到' : ' 已取消報到'}。`);
    } catch (error) {
      showToast(error.message, 'error');
      requestRender();
    }
  }));
  root.querySelector('[data-add-draft-player-form]')?.addEventListener('submit', async (event) => {
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
  root.querySelectorAll('[data-edit-player]').forEach((button) => button.addEventListener('click', () => {
    const tournament = state.tournaments.find((item) => item.id === state.selectedTournamentId);
    const player = button.dataset.editPlayer;
    const details = tournament.participantDetails?.[player] || {};
    const dialog = root.querySelector('[data-edit-player-dialog]');
    const form = dialog.querySelector('[data-edit-draft-player-form]');
    form.elements.originalName.value = player;
    form.elements.playerName.value = player;
    form.elements.phone.value = details.phone || '';
    const slot = form.querySelector('[data-edit-drink-slot]');
    slot.innerHTML = drinkSelectionFields(tournament.drinkSettings, details.drink, { prefix: 'editDrink' });
    bindDrinkSelectionFields(slot);
    dialog.showModal();
  }));
  root.querySelector('[data-edit-draft-player-form]')?.addEventListener('submit', async (event) => {
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
  root.querySelector('[data-copy-drink-summary]')?.addEventListener('click', async (event) => {
    await copyText(event.currentTarget.dataset.copyDrinkSummary);
    showToast('飲品統計已複製。');
  });
}

function bindMatchAdministration(root, state, requestRender) {
  root.querySelectorAll('[data-replay-round]').forEach((button) => button.addEventListener('click', () => {
    const tournament = state.tournaments.find((item) => item.id === state.selectedTournamentId);
    const roundIndex = Number(button.dataset.replayRound);
    const matchIndex = Number(button.dataset.replayMatch);
    const match = tournament.rounds[roundIndex].matches[matchIndex];
    const hasDownstreamRounds = tournament.rounds.length > roundIndex + 1;
    const warning = hasDownstreamRounds
      ? '\n這場之後已產生的輪次與比賽結果也會一併清除，重新依新勝者產生。'
      : '';
    if (!confirm(`確定要讓「${match.playerA} vs ${match.playerB}」重新比賽嗎？\n該場比分與勝負會清除。${warning}`)) return;
    replayMatch(tournament.id, roundIndex, matchIndex, requestRender);
  }));
  root.querySelectorAll('[data-withdraw-player], [data-no-show-player]').forEach((button) => button.addEventListener('click', () => {
    const tournament = state.tournaments.find((item) => item.id === state.selectedTournamentId);
    const player = button.dataset.withdrawPlayer || button.dataset.noShowPlayer;
    const status = button.dataset.noShowPlayer ? 'no_show' : 'withdrawn';
    const label = status === 'no_show' ? '未出席' : '中途退賽';
    if (!confirm(`確定將「${player}」標記為${label}嗎？\n若已有尚未進行的對戰，對手將以 4：0 不戰勝。`)) return;
    updateParticipantStatus(tournament.id, player, status);
  }));
  root.querySelector('[data-swiss-qualifier-form]')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const candidates = [...event.currentTarget.querySelectorAll('input[name="candidate"]:checked')].map((input) => input.value);
    if (!confirm(`確定為選取的 ${candidates.length} 位選手建立資格積分決定賽嗎？`)) return;
    beginSwissQualifier(state.selectedTournamentId, candidates);
  });
  root.querySelector('[data-swiss-final-form]')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const finalists = [...event.currentTarget.querySelectorAll('input[name="finalist"]:checked')].map((input) => input.value);
    const mode = event.currentTarget.querySelector('input[name="swissFinalMode"]:checked')?.value;
    const label = mode === 'single_elimination' ? '前四單淘汰決賽（含季軍賽）' : '前四循環決賽';
    if (!confirm(`確定由這 ${finalists.length} 位選手進入${label}嗎？`)) return;
    beginSwissFinal(state.selectedTournamentId, finalists, mode);
  });
  root.querySelector('[data-complete-swiss-standings]')?.addEventListener('click', () => {
    if (!confirm('確定以目前瑞士輪積分榜作為最終成績並結束賽事嗎？此操作不會再建立四強賽程。')) return;
    completeSwissByStandings(state.selectedTournamentId);
  });
  root.querySelector('[data-action="complete-tournament-early"]')?.addEventListener('click', async () => {
    if (!confirm('確定要提前結束賽事，依目前勝敗與總得分結算嗎？')) return;
    try { await executeTournamentAction(state.selectedTournamentId, 'complete_tournament_early'); } catch (error) { alert(error.message); }
  });
  root.querySelector('[data-round-robin-tiebreak-form]')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const candidates = [...event.currentTarget.querySelectorAll('input[name="candidate"]:checked')].map((input) => input.value);
    if (!confirm(`確定為選取的 ${candidates.length} 位並列選手建立同分加賽嗎？`)) return;
    beginRoundRobinTieBreak(state.selectedTournamentId, candidates);
  });
}

function bindTournamentLifecycle(root, state, requestRender) {
  root.querySelectorAll('[data-opening-pairings-form] select').forEach((select) => select.addEventListener('change', () => {
    const form = select.form;
    const selected = [...form.querySelectorAll('select')];
    const duplicate = selected.find((other) => other !== select && other.value === select.value);
    if (!duplicate) return;
    const previous = select.dataset.previousValue || duplicate.dataset.previousValue || '';
    if (previous && previous !== select.value) duplicate.value = previous;
    selected.forEach((item) => { item.dataset.previousValue = item.value; });
  }));
  root.querySelectorAll('[data-opening-pairings-form] select').forEach((select) => { select.dataset.previousValue = select.value; });
  root.querySelector('[data-opening-pairings-form]')?.addEventListener('submit', async (event) => {
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
  root.querySelector('[data-action="prepare-tournament-schedule"]')?.addEventListener('click', async () => {
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
  root.querySelectorAll('[data-action="randomize-schedule"]').forEach((button) => button.addEventListener('click', async () => {
    const tournament = state.tournaments.find((item) => item.id === state.selectedTournamentId);
    if (tournament.rounds?.length && !confirm('確定要重新隨機分組嗎？目前手動調整的首輪對戰會被取代。')) return;
    try {
      await executeTournamentAction(tournament.id, 'randomize_schedule');
      showToast('隨機分組完成，仍可手動調整對戰。');
    } catch (error) {
      showToast(error.message, 'error');
    }
  }));
  root.querySelector('[data-action="confirm-tournament-schedule"]')?.addEventListener('click', async () => {
    const tournament = state.tournaments.find((item) => item.id === state.selectedTournamentId);
    if (!confirm(`確定使用目前的首輪對戰開始「${tournament.name}」嗎？\n開始後即可由裁判進入節點記分，首輪配對也會鎖定。`)) return;
    try {
      await executeTournamentAction(tournament.id, 'confirm_tournament_schedule');
      showToast('正式賽事已開始。');
    } catch (error) {
      showToast(error.message, 'error');
    }
  });
  root.querySelector('[data-action="start-tournament"]')?.addEventListener('click', () => {
    const tournament = state.tournaments.find((item) => item.id === state.selectedTournamentId);
    const checkedInCount = tournament.players.filter((player) => tournament.participantStates?.[player]?.checkedIn).length;
    const absentCount = tournament.players.length - checkedInCount;
    if (!confirm(`確定開始「${tournament.name}」嗎？\n${checkedInCount} 位已報到選手會進入賽程，${absentCount} 位未報到者會標記為未出席。開始後將鎖定名單。`)) return;
    beginTournament(tournament.id);
  });
  root.querySelector('[data-action="draw-seeds"]')?.addEventListener('click', () => {
    const tournament = state.tournaments.find((item) => item.id === state.selectedTournamentId);
    const isRedraw = tournament.seedPlayerIndexes?.length > 0;
    if (isRedraw && !confirm('確定要重新隨機抽選種子選手嗎？\n目前的種子與預覽賽程會被重新產生。')) return;
    drawSeeds(tournament.id);
  });
  root.querySelector('[data-action="randomize-bracket"]')?.addEventListener('click', () => {
    const tournament = state.tournaments.find((item) => item.id === state.selectedTournamentId);
    const seedWarning = requiredSeedCount(tournament) ? '\n原本抽出的種子也會清除，需要重新抽選。' : '';
    if (!confirm(`確定要重新隨機排列「${tournament.name}」的對戰分組嗎？${seedWarning}`)) return;
    randomizeBracket(tournament.id);
  });
  root.querySelector('[data-action="back-events"]')?.addEventListener('click', () => {
    selectTournament(null);
    requestRender();
  });
}

function prepareRosterUi(tournamentId) {
  if (rosterUiState.tournamentId === tournamentId) return;
  rosterUiState = { tournamentId, filter: 'all', query: '', removing: false, selected: new Set() };
}

function applyRosterUi(root) {
  const panel = root.querySelector('.check-in-panel');
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

function bindTournamentListEvents(root) {
  const list = root.querySelector('[data-tournament-list]');
  if (!list) return;
  list.querySelectorAll('[data-tournament-list-tab]').forEach((button) => button.addEventListener('click', () => {
    tournamentListUiState.tab = button.dataset.tournamentListTab;
    applyTournamentListUi(list);
  }));
  list.querySelector('[data-history-search]')?.addEventListener('input', (event) => {
    tournamentListUiState.query = event.target.value;
    applyTournamentListUi(list);
  });
  list.querySelector('[data-history-year]')?.addEventListener('change', (event) => {
    tournamentListUiState.year = event.target.value;
    applyTournamentListUi(list);
  });
  list.querySelector('[data-history-format]')?.addEventListener('change', (event) => {
    tournamentListUiState.format = event.target.value;
    applyTournamentListUi(list);
  });
  applyTournamentListUi(list);
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

function restoreScheduleScroll() {
  if (!scheduleScrollRestore) return;
  const position = scheduleScrollRestore;
  scheduleScrollRestore = null;
  requestAnimationFrame(() => window.scrollTo({ top: position.top, left: position.left, behavior: 'auto' }));
}

async function beginSwissQualifier(tournamentId, candidates) {
  try { await executeTournamentAction(tournamentId, 'start_swiss_qualifier', { players: candidates }); }
  catch (error) { alert(error.message); }
}

async function beginSwissFinal(tournamentId, finalists, mode) {
  try { await executeTournamentAction(tournamentId, 'start_swiss_final', { players: finalists, mode }); }
  catch (error) { alert(error.message); }
}

async function completeSwissByStandings(tournamentId) {
  try { await executeTournamentAction(tournamentId, 'complete_swiss_by_standings'); }
  catch (error) { alert(error.message); }
}

async function beginRoundRobinTieBreak(tournamentId, candidates) {
  try { await executeTournamentAction(tournamentId, 'start_round_robin_tiebreak', { players: candidates }); }
  catch (error) { alert(error.message); }
}

async function drawSeeds(tournamentId) {
  try { await executeTournamentAction(tournamentId, 'draw_seeds'); }
  catch (error) { alert(error.message); }
}

async function randomizeBracket(tournamentId) {
  try { await executeTournamentAction(tournamentId, 'randomize_bracket'); }
  catch (error) { alert(error.message); }
}

async function beginTournament(tournamentId) {
  try { await executeTournamentAction(tournamentId, 'start_tournament'); }
  catch (error) { alert(error.message); }
}

async function deleteTournament(tournamentId, requestRender) {
  try {
    await deleteTournamentRecord(tournamentId);
    selectTournament(null);
    requestRender();
  } catch (error) {
    alert(error.message);
  }
}

async function copyTournament(tournamentId, requestRender) {
  try {
    const source = getState().tournaments.find((tournament) => tournament.id === tournamentId);
    if (!source) throw new Error('找不到要複製的賽事。');
    const copy = duplicateTournament(source);
    const saved = await createTournamentRecord(copy);
    selectTournament(saved.id);
    requestRender();
  } catch (error) {
    alert(error.message);
  }
}

async function replayMatch(tournamentId, roundIndex, matchIndex, requestRender) {
  try {
    await executeTournamentAction(tournamentId, 'replay_match', { roundIndex, matchIndex });
    selectMatch(null, null);
    requestRender();
  } catch (error) {
    alert(error.message);
  }
}

async function completeMatch(tournamentId, roundIndex, matchIndex, scoreA, scoreB, requestRender) {
  try {
    await executeTournamentAction(tournamentId, 'record_match', { roundIndex, matchIndex, scoreA, scoreB });
    selectMatch(null, null);
    requestRender();
  } catch (error) {
    selectMatch(null, null);
    requestRender();
    alert(error.message);
  }
}

async function completeForfeit(tournamentId, roundIndex, matchIndex, player, requestRender) {
  try {
    await executeTournamentAction(tournamentId, 'forfeit_match', { roundIndex, matchIndex, player });
    selectMatch(null, null);
    requestRender();
  } catch (error) {
    selectMatch(null, null);
    requestRender();
    alert(error.message);
  }
}

async function updateParticipantStatus(tournamentId, player, status) {
  try { await executeTournamentAction(tournamentId, 'withdraw_player', { player, status }); }
  catch (error) { alert(error.message); }
}

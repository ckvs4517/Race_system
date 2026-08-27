/**
 * 報到 interaction：局部更新 DOM 並序列化雲端寫入，避免大量報到造成 revision 衝突。
 */
import { executeTournamentAction } from '../../data/store.js';
import { showToast } from '../../ui/toast.js';

let checkInSaveQueue = Promise.resolve();

function enqueueCheckInSave(task) {
  const pending = checkInSaveQueue.then(task, task);
  checkInSaveQueue = pending.catch(() => undefined);
  return pending;
}

function checkInInputFor(root, player) {
  return [...root.querySelectorAll('[data-check-in-player]')]
    .find((input) => input.dataset.checkInPlayer === player) || null;
}

function updateCheckInUi(root, player, checkedIn, applyRosterUi) {
  const panel = root.querySelector('.check-in-panel');
  if (!panel) return;
  const input = checkInInputFor(root, player);
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
  const prepareButton = root.querySelector('[data-action="prepare-tournament-schedule"]');
  if (prepareButton) prepareButton.disabled = checkedInCount < minimumPlayers;
  const allButton = panel.querySelector('[data-check-in-all]');
  if (allButton) allButton.disabled = total > 0 && checkedInCount >= total;
  applyRosterUi?.();
}

export function bindCheckInControls(root, state, { applyRosterUi, requestRender }) {
  root.querySelector('[data-check-in-all]')?.addEventListener('click', (event) => {
    const button = event.currentTarget;
    const inputs = [...root.querySelectorAll('[data-check-in-player]')];
    if (!inputs.length) return;
    inputs.forEach((input) => updateCheckInUi(root, input.dataset.checkInPlayer, true, applyRosterUi));
    button.disabled = true;
    button.textContent = '報到處理中…';
    enqueueCheckInSave(async () => {
      try {
        await executeTournamentAction(state.selectedTournamentId, 'set_all_check_in');
        showToast(`已完成 ${inputs.length} 位選手報到。`);
      } catch (error) {
        showToast(error.message, 'error');
        requestRender();
      }
    });
  });

  root.querySelectorAll('[data-check-in-player]').forEach((input) => input.addEventListener('change', () => {
    const player = input.dataset.checkInPlayer;
    const checkedIn = input.checked;
    updateCheckInUi(root, player, checkedIn, applyRosterUi);
    input.disabled = true;
    enqueueCheckInSave(async () => {
      try {
        await executeTournamentAction(state.selectedTournamentId, 'set_check_in', { player, checkedIn });
        updateCheckInUi(root, player, checkedIn, applyRosterUi);
        const currentInput = checkInInputFor(root, player);
        if (currentInput) currentInput.disabled = false;
        showToast(`${player}${checkedIn ? ' 已報到' : ' 已取消報到'}。`);
      } catch (error) {
        updateCheckInUi(root, player, !checkedIn, applyRosterUi);
        const currentInput = checkInInputFor(root, player);
        if (currentInput) currentInput.disabled = false;
        showToast(error.message, 'error');
      }
    });
  }));
}

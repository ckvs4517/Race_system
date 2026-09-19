/** 歷史比分修正 UI；impact 可先在 client 預覽，正式 Repair 仍由 Worker 重驗。 */
import { executeTournamentAction } from '../../data/store.js';
import { analyzeMatchScoreCorrection } from '../../domain/tournament.js';
import { showToast } from '../../ui/toast.js';

export function bindScoreCorrectionControls(root, state) {
  const dialog = root.querySelector('[data-score-correction-dialog]');
  const form = root.querySelector('[data-score-correction-form]');
  if (!dialog || !form) return;

  root.querySelectorAll('[data-correct-round]').forEach((button) => button.addEventListener('click', () => {
    const tournament = state.tournaments.find((item) => item.id === state.selectedTournamentId);
    const roundIndex = Number(button.dataset.correctRound);
    const matchIndex = Number(button.dataset.correctMatch);
    const match = tournament?.rounds?.[roundIndex]?.matches?.[matchIndex];
    if (!match || match.status !== '已完成') return;

    resetRepairPreview(dialog, form);
    form.elements.roundIndex.value = String(roundIndex);
    form.elements.matchIndex.value = String(matchIndex);
    form.elements.scoreA.value = String(match.scoreA ?? 0);
    form.elements.scoreB.value = String(match.scoreB ?? 0);
    dialog.querySelector('[data-score-correction-player-a]').textContent = match.playerA;
    dialog.querySelector('[data-score-correction-player-b]').textContent = match.playerB;
    dialog.querySelector('[data-score-correction-label-a]').textContent = match.playerA;
    dialog.querySelector('[data-score-correction-label-b]').textContent = match.playerB;
    const replay = dialog.querySelector('[data-replay-round]');
    replay.dataset.replayRound = String(roundIndex);
    replay.dataset.replayMatch = String(matchIndex);
    clearError(dialog);
    dialog.showModal();
    queueMicrotask(() => form.elements.scoreA.focus());
  }));

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const tournament = state.tournaments.find((item) => item.id === state.selectedTournamentId);
    const values = correctionValues(form);
    const submit = form.querySelector('[data-score-correction-submit]');
    submit.disabled = true;
    submit.textContent = '檢查影響中…';
    clearError(dialog);

    try {
      const impact = analyzeMatchScoreCorrection(
        tournament,
        values.roundIndex,
        values.matchIndex,
        values.scoreA,
        values.scoreB,
      );
      if (impact.level === 1 && impact.repairable) {
        showRepairPreview(dialog, form, impact);
        submit.disabled = false;
        submit.textContent = '儲存修正';
        return;
      }
      if (impact.level !== 0) throw new Error(impact.message);

      await executeTournamentAction(state.selectedTournamentId, 'correct_match_score', values, { retryOnConflict: false });
      dialog.close();
      showToast('比分已安全修正。');
    } catch (cause) {
      showError(dialog, cause.message);
      showToast(cause.message, 'error');
      submit.disabled = false;
      submit.textContent = '儲存修正';
    }
  });

  dialog.querySelector('[data-repair-back]')?.addEventListener('click', () => {
    resetRepairPreview(dialog, form);
    clearError(dialog);
    queueMicrotask(() => form.elements.scoreA.focus());
  });

  dialog.querySelector('[data-confirm-score-repair]')?.addEventListener('click', async (event) => {
    const reason = form.elements.repairReason.value.trim();
    if (!reason) {
      showError(dialog, '請填寫比分修正原因。');
      form.elements.repairReason.focus();
      return;
    }

    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = '正在安全修復…';
    clearError(dialog);
    try {
      await executeTournamentAction(
        state.selectedTournamentId,
        'repair_match_score',
        { ...correctionValues(form), reason },
        { retryOnConflict: false },
      );
      dialog.close();
      showToast('比分與賽事戰績已完成 Repair。');
    } catch (cause) {
      showError(dialog, cause.message);
      showToast(cause.message, 'error');
      button.disabled = false;
      button.textContent = '確認修復';
    }
  });
}

function correctionValues(form) {
  return {
    roundIndex: Number(form.elements.roundIndex.value),
    matchIndex: Number(form.elements.matchIndex.value),
    scoreA: Number(form.elements.scoreA.value),
    scoreB: Number(form.elements.scoreB.value),
  };
}

function showRepairPreview(dialog, form, impact) {
  const preview = impact.preview;
  const section = dialog.querySelector('[data-repair-preview]');
  const changes = dialog.querySelector('[data-repair-changes]');
  section.hidden = false;
  dialog.querySelector('[data-score-correction-actions]').hidden = true;
  dialog.querySelector('[data-score-correction-advanced]').hidden = true;
  dialog.querySelector('[data-score-correction-help]').hidden = true;
  form.elements.scoreA.disabled = true;
  form.elements.scoreB.disabled = true;
  form.elements.repairReason.value = '';

  dialog.querySelector('[data-repair-summary]').textContent =
    `${preview.before.playerA} ${preview.before.scoreA}：${preview.before.scoreB} ${preview.before.playerB} → ${preview.after.playerA} ${preview.after.scoreA}：${preview.after.scoreB} ${preview.after.playerB}`;

  changes.replaceChildren();
  if (!preview.changes.length) {
    const empty = document.createElement('p');
    empty.textContent = '勝者或賽事狀態會改變，但目前沒有額外排名欄位差異可顯示。';
    changes.append(empty);
  } else {
    preview.changes.forEach((change) => {
      const row = document.createElement('div');
      const name = document.createElement('b');
      const detail = document.createElement('span');
      name.textContent = change.player;
      detail.textContent = [
        `勝場 ${change.winsBefore} → ${change.winsAfter}`,
        `敗場 ${change.lossesBefore} → ${change.lossesAfter}`,
        change.rankBefore || change.rankAfter ? `排名 ${change.rankBefore ?? '—'} → ${change.rankAfter ?? '—'}` : '',
      ].filter(Boolean).join(' · ');
      row.append(name, detail);
      changes.append(row);
    });
  }

  const preserved = preview.preservedRoundIndexes.map((index) => `Round ${index + 1}`);
  const locked = preview.lockedRoundIndexes.map((index) => `Round ${index + 1}`);
  dialog.querySelector('[data-repair-rounds]').textContent = preserved.length
    ? `已產生的 ${preserved.join('、')} 將保留原 pairing，不會重新配對。${locked.length ? ` 其中 ${locked.join('、')} 已有正式賽果，視為 LOCKED。` : ''} 下一個尚未產生的 Round 會使用修正後的累積戰績。`
    : '目前沒有 downstream Round；後續新產生的 Round 會直接使用修正後的累積戰績。';

  queueMicrotask(() => form.elements.repairReason.focus());
}

function resetRepairPreview(dialog, form) {
  const section = dialog.querySelector('[data-repair-preview]');
  if (section) section.hidden = true;
  const actions = dialog.querySelector('[data-score-correction-actions]');
  if (actions) actions.hidden = false;
  const advanced = dialog.querySelector('[data-score-correction-advanced]');
  if (advanced) advanced.hidden = false;
  const help = dialog.querySelector('[data-score-correction-help]');
  if (help) help.hidden = false;
  form.elements.scoreA.disabled = false;
  form.elements.scoreB.disabled = false;
  form.elements.repairReason.value = '';
  const confirm = dialog.querySelector('[data-confirm-score-repair]');
  if (confirm) {
    confirm.disabled = false;
    confirm.textContent = '確認修復';
  }
}

function clearError(dialog) {
  const error = dialog.querySelector('[data-score-correction-error]');
  error.hidden = true;
  error.textContent = '';
}

function showError(dialog, message) {
  const error = dialog.querySelector('[data-score-correction-error]');
  error.textContent = message;
  error.hidden = false;
}

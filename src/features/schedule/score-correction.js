/** 歷史比分修正 UI；是否安全由 server/domain 決定，前端不自行推測 impact。 */
import { executeTournamentAction } from '../../data/store.js';
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
    const error = dialog.querySelector('[data-score-correction-error]');
    error.hidden = true;
    error.textContent = '';
    dialog.showModal();
    queueMicrotask(() => form.elements.scoreA.focus());
  }));

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = form.querySelector('button[type="submit"]');
    const error = dialog.querySelector('[data-score-correction-error]');
    submit.disabled = true;
    submit.textContent = '檢查影響中…';
    error.hidden = true;
    error.textContent = '';
    try {
      await executeTournamentAction(state.selectedTournamentId, 'correct_match_score', {
        roundIndex: Number(form.elements.roundIndex.value),
        matchIndex: Number(form.elements.matchIndex.value),
        scoreA: Number(form.elements.scoreA.value),
        scoreB: Number(form.elements.scoreB.value),
      }, { retryOnConflict: false });
      dialog.close();
      showToast('比分已安全修正。');
    } catch (cause) {
      error.textContent = cause.message;
      error.hidden = false;
      showToast(cause.message, 'error');
      submit.disabled = false;
      submit.textContent = '儲存修正';
    }
  });
}

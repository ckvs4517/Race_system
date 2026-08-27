/** 第二階段賽制欄位的 UI 同步；賽制有效性仍由 domain / Worker 驗證。 */
export function bindStage2RoundsVisibility(form) {
  if (!form) return;
  const syncStage2RoundsField = () => {
    const roundsField = form.querySelector('[data-stage2-rounds]');
    if (!roundsField) return;
    const roundsInput = roundsField.querySelector('input[name="swissStage2Rounds"]');
    const showRounds = form.querySelector('input[name="swissFinalMode"]:checked')?.value === 'swiss';
    roundsField.hidden = !showRounds;
    roundsField.style.display = showRounds ? '' : 'none';
    if (roundsInput) roundsInput.disabled = !showRounds;
  };
  form.querySelectorAll('input[name="swissFinalMode"]').forEach((input) => input.addEventListener('change', syncStage2RoundsField));
  syncStage2RoundsField();
}

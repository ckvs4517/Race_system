/** 單一歷史比分修正入口；高風險 Repair 由 domain 判斷並阻擋。 */
export function scoreCorrectionDialogView(canManage) {
  if (!canManage) return '';
  return `<dialog class="mobile-sheet" data-score-correction-dialog>
    <form method="dialog" class="mobile-sheet-card" data-score-correction-form>
      <div class="mobile-sheet-heading"><div><p class="kicker">SCORE CORRECTION</p><h2>修正比分</h2></div><button type="button" data-close-dialog aria-label="關閉">×</button></div>
      <p class="score-correction-match"><strong data-score-correction-player-a></strong><span>VS</span><strong data-score-correction-player-b></strong></p>
      <div class="score-correction-fields">
        <label><span data-score-correction-label-a>選手 A</span><input type="number" name="scoreA" min="0" step="1" inputmode="numeric" required></label>
        <label><span data-score-correction-label-b>選手 B</span><input type="number" name="scoreB" min="0" step="1" inputmode="numeric" required></label>
      </div>
      <input type="hidden" name="roundIndex">
      <input type="hidden" name="matchIndex">
      <p class="score-correction-help">安全修正會直接更新比分；若會影響勝者、排名或賽程，系統會阻擋並要求使用 Repair Flow。</p>
      <p class="score-correction-error" data-score-correction-error role="alert" hidden></p>
      <details class="score-correction-advanced">
        <summary>需要讓這場重新比賽？</summary>
        <p>重新比賽是不同操作，可能清除這場之後已產生的輪次與結果。</p>
        <button type="button" class="button button-danger" data-replay-round="" data-replay-match="">清除結果並重新比賽</button>
      </details>
      <div class="mobile-sheet-actions"><button type="button" class="button button-secondary" data-close-dialog>取消</button><button class="button button-primary" type="submit">儲存修正</button></div>
    </form>
  </dialog>`;
}

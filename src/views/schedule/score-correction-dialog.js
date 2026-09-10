/** 單一歷史比分修正入口；Level 1 會在同一流程顯示 impact preview。 */
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
      <p class="score-correction-help" data-score-correction-help>安全修正會直接更新比分；若會影響勝者或排名，系統會先顯示 Impact Preview，再由管理者確認 Repair。</p>
      <p class="score-correction-error" data-score-correction-error role="alert" hidden></p>

      <section class="score-repair-preview" data-repair-preview hidden>
        <div class="score-repair-preview-heading"><div><p class="kicker">IMPACT PREVIEW</p><h3>此修正會影響賽事戰績</h3></div><b>LEVEL 1</b></div>
        <p data-repair-summary></p>
        <div class="score-repair-changes" data-repair-changes></div>
        <p class="score-repair-rounds" data-repair-rounds></p>
        <label class="score-repair-reason"><span>修正原因</span><textarea name="repairReason" maxlength="300" placeholder="例如：裁判確認原始比分輸入反向" required></textarea></label>
        <div class="mobile-sheet-actions">
          <button type="button" class="button button-secondary" data-repair-back>返回修改</button>
          <button type="button" class="button button-danger" data-confirm-score-repair>確認修復</button>
        </div>
      </section>

      <details class="score-correction-advanced" data-score-correction-advanced>
        <summary>需要讓這場重新比賽？</summary>
        <p>重新比賽是不同操作，可能清除這場之後已產生的輪次與結果。</p>
        <button type="button" class="button button-danger" data-replay-round="" data-replay-match="">清除結果並重新比賽</button>
      </details>
      <div class="mobile-sheet-actions" data-score-correction-actions><button type="button" class="button button-secondary" data-close-dialog>取消</button><button class="button button-primary" type="submit" data-score-correction-submit>儲存修正</button></div>
    </form>
  </dialog>`;
}

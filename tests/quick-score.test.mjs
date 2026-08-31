/** 主控快速登分：本機模式、比分選擇、驗證與賽程畫面入口回歸。 */
import { readFileSync } from 'node:fs';
import { createTournament, recordMatchResult, setDraftPlayerCheckedIn, startTournament } from '../src/domain/tournament.js';
import {
  applyQuickScoreChoice,
  createQuickScoreSelection,
  parseQuickScoreText,
  QUICK_SCORE_CHOICES,
  QUICK_SCORE_MODE_KEY,
  quickScoreSelectionStatus,
  readQuickScoreMode,
  selectQuickScoreSide,
  validateQuickScoreInput,
  writeQuickScoreMode,
} from '../src/core/quick-score.js';
import { scheduleView } from '../src/views/schedule.js';

let assertions = 0;
const expect = (condition, message) => {
  if (!condition) throw new Error(message);
  assertions += 1;
};

const storage = memoryStorage();
expect(readQuickScoreMode(storage) === false, '快速登分預設關閉');
writeQuickScoreMode(true, storage);
expect(storage.getItem(QUICK_SCORE_MODE_KEY) === '1' && readQuickScoreMode(storage), '快速登分只保存在 session 類型儲存空間');
writeQuickScoreMode(false, storage);
expect(!storage.getItem(QUICK_SCORE_MODE_KEY) && !readQuickScoreMode(storage), '快速登分可關閉且不修改賽事資料');

expect(QUICK_SCORE_CHOICES.join(',') === '0,1,2,3,4,5,6', '視覺快速登分固定提供 0～6 分');
let selection = createQuickScoreSelection();
expect(selection.activeSide === 'a' && selection.scoreA === null && selection.scoreB === null, '快速登分預設先選第一位選手');
selection = applyQuickScoreChoice(selection, 4);
expect(selection.scoreA === 4 && selection.activeSide === 'b', '第一位選手選分後自動切到第二位');
selection = applyQuickScoreChoice(selection, 2);
let selectionStatus = quickScoreSelectionStatus(selection);
expect(selectionStatus.valid && selectionStatus.scoreA === 4 && selectionStatus.scoreB === 2, '4:2 視覺點選結果可送出');
selection = selectQuickScoreSide(selection, 'a');
selection = applyQuickScoreChoice(selection, 5);
expect(quickScoreSelectionStatus(selection).valid, '可重新點第一位選手修改為 5:2');
selection = selectQuickScoreSide(selection, 'b');
selection = applyQuickScoreChoice(selection, 4);
selectionStatus = quickScoreSelectionStatus(selection);
expect(selectionStatus.complete && !selectionStatus.valid && /敗方/.test(selectionStatus.error), '5:4 會顯示不合法且不可送出');
selection = applyQuickScoreChoice(selection, 3);
expect(quickScoreSelectionStatus(selection).valid, '修正為 5:3 後恢復可送出');
let invalidChoiceRejected = false;
try { applyQuickScoreChoice(selection, 7); } catch { invalidChoiceRejected = true; }
expect(invalidChoiceRejected, '視覺快速登分拒絕 0～6 以外的快捷分數');

expect(JSON.stringify(validateQuickScoreInput('4', '0')) === JSON.stringify({ scoreA: 4, scoreB: 0 }), '4:0 可快速登分');
expect(JSON.stringify(validateQuickScoreInput('6', '3')) === JSON.stringify({ scoreA: 6, scoreB: 3 }), '勝方超過 4 分但敗方未達 4 分可快速登分');
for (const compact of ['42', '4:2', '4：2', '4 2', '4-2']) expect(JSON.stringify(parseQuickScoreText(compact)) === JSON.stringify({ scoreA: 4, scoreB: 2 }), `${compact} 鍵盤 parser 繼續可解析為 4:2`);
let invalidCompactRejected = false;
try { parseQuickScoreText('64'); } catch { invalidCompactRejected = true; }
expect(invalidCompactRejected, '舊文字 parser 仍套用正式比分規則');
for (const [a, b, label] of [['2', '1', '勝方未達 4 分'], ['4', '4', '平手'], ['6', '4', '敗方已達 4 分'], ['-1', '4', '負數'], ['4.5', '2', '非整數'], ['', '4', '空白']]) {
  let rejected = false;
  try { validateQuickScoreInput(a, b); } catch { rejected = true; }
  expect(rejected, `${label}會被快速登分前端拒絕`);
}

const pickerSource = readFileSync(new URL('../src/features/schedule/quick-score.js', import.meta.url), 'utf8');
expect(pickerSource.includes('data-quick-score-player="a"') && pickerSource.includes('data-quick-score-player="b"'), '快速登分 UI 固定顯示兩位選手列');
expect(pickerSource.includes('data-quick-score-value='), '快速登分 UI 使用視覺分數按鈕');
expect(pickerSource.includes('type="hidden" name="score"'), '舊文字 parser 僅保留隱藏相容入口供底層能力使用');
expect(!pickerSource.includes('type="text" inputmode="numeric"'), '快速登分不再顯示文字比分輸入欄');
expect(pickerSource.includes('submit.disabled = Boolean(quickScoreDraft.submitting) || !status.valid'), '不完整或不合法比分無法按確認送出');

const pickerCss = readFileSync(new URL('../src/styles/quick-score-inline.css', import.meta.url), 'utf8');
expect(pickerCss.includes('repeat(auto-fit, minmax(42px') && pickerCss.includes('min-height: 48px'), '0～6 分按鈕依可用寬度自動換列且保持觸控尺寸');
expect(pickerCss.includes('white-space: nowrap') && pickerCss.includes('text-overflow: ellipsis'), '窄欄位的確認按鈕不會被擠成多行');
expect(pickerCss.includes('.quick-score-player-row.is-active') && pickerCss.includes('.quick-score-choice-grid button.is-selected'), '目前選手與已選分數都有明顯視覺狀態');

let tournament = createTournament('快速登分測試賽', ['A', 'B', 'C', 'D']);
for (const player of tournament.players) tournament = setDraftPlayerCheckedIn(tournament, player, true);
tournament = startTournament(tournament);
let invalidDomainScoreRejected = false;
try { recordMatchResult(tournament, 0, 0, 6, 4); } catch { invalidDomainScoreRejected = true; }
expect(invalidDomainScoreRejected, '正式賽果領域層拒絕敗方已達 4 分的 6:4');
const normal = scheduleView([tournament], tournament.id, true, false);
const quick = scheduleView([tournament], tournament.id, true, true);
const publicView = scheduleView([tournament], tournament.id, false, true);
expect(normal.includes('data-action="toggle-quick-score"') && normal.includes('aria-pressed="false"'), 'Admin 進行中賽事顯示快速登分切換按鈕');
expect(quick.includes('aria-pressed="true"') && quick.includes('快速登分模式已開啟'), '快速登分 ON 有明確模式提示');
expect(!quick.includes('data-quick-score-dialog'), '快速登分不預載阻塞式 modal');
expect(!publicView.includes('data-action="toggle-quick-score"'), '公開賽程不提供快速登分控制');

console.log(`PASS ${assertions} quick score assertions`);

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

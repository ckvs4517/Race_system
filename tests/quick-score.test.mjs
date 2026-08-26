/** 主控快速登分：本機模式、比分驗證與賽程畫面入口回歸。 */
import { createTournament, setDraftPlayerCheckedIn, startTournament } from '../src/domain/tournament.js';
import { QUICK_SCORE_MODE_KEY, readQuickScoreMode, validateQuickScoreInput, writeQuickScoreMode } from '../src/core/quick-score.js';
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

expect(JSON.stringify(validateQuickScoreInput('4', '0')) === JSON.stringify({ scoreA: 4, scoreB: 0 }), '4:0 可快速登分');
expect(JSON.stringify(validateQuickScoreInput('6', '4')) === JSON.stringify({ scoreA: 6, scoreB: 4 }), '6:4 overshoot 可快速登分');
for (const [a, b, label] of [['2', '1', '勝方未達 4 分'], ['4', '4', '平手'], ['-1', '4', '負數'], ['4.5', '2', '非整數'], ['', '4', '空白']]) {
  let rejected = false;
  try { validateQuickScoreInput(a, b); } catch { rejected = true; }
  expect(rejected, `${label}會被快速登分前端拒絕`);
}

let tournament = createTournament('快速登分測試賽', ['A', 'B', 'C', 'D']);
for (const player of tournament.players) tournament = setDraftPlayerCheckedIn(tournament, player, true);
tournament = startTournament(tournament);
const normal = scheduleView([tournament], tournament.id, true, false);
const quick = scheduleView([tournament], tournament.id, true, true);
const publicView = scheduleView([tournament], tournament.id, false, true);
expect(normal.includes('data-action="toggle-quick-score"') && normal.includes('aria-pressed="false"'), 'Admin 進行中賽事顯示快速登分切換按鈕');
expect(quick.includes('aria-pressed="true"') && quick.includes('快速登分模式已開啟'), '快速登分 ON 有明確模式提示');
expect(quick.includes('data-quick-score-dialog') && quick.includes('data-quick-score-form'), '賽程頁內建快速比分小視窗');
expect(!publicView.includes('data-action="toggle-quick-score"') && !publicView.includes('data-quick-score-dialog'), '公開賽程不提供快速登分控制');

console.log(`PASS ${assertions} quick score assertions`);

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

/** Issue #8：正式記分同步失敗時保留比分、允許重新送出，且 409 不盲目覆寫。 */
import { readFileSync } from 'node:fs';
import { scoreboardView } from '../src/views/scoreboard.js';

let assertions = 0;
const expect = (condition, message) => {
  if (!condition) throw new Error(message);
  assertions += 1;
};

const controllerSource = readFileSync(new URL('../src/features/schedule/controller.js', import.meta.url), 'utf8');
const scoreboardSource = readFileSync(new URL('../src/views/scoreboard.js', import.meta.url), 'utf8');
const completeMatchStart = controllerSource.indexOf('async function completeMatch');
const completeForfeitStart = controllerSource.indexOf('async function completeForfeit');
const completeMatchSource = controllerSource.slice(completeMatchStart, completeForfeitStart);

expect(completeMatchStart >= 0 && completeForfeitStart > completeMatchStart, '正式記分完成流程仍由 schedule controller 管理');
expect(completeMatchSource.includes("{ retryOnConflict: false }"), 'record_match 遇到 409 不會自動重送舊比分覆寫最新版');
expect(completeMatchSource.includes('rememberFormalScoreDraft'), '送出前會先保存目前正式比分 draft');
expect(completeMatchSource.includes('latestMatch.status !== \'可開始\''), '衝突後會依伺服器最新 match 狀態決定是否仍可留在記分畫面');
expect(!completeMatchSource.includes('alert(error.message)'), '正式比分同步失敗不再只用 alert 後離開記分畫面');
expect(completeMatchSource.includes('`同步失敗：${error.message'), '同步錯誤會轉為記分畫面的明確錯誤狀態');

const matchMarkup = scoreboardView({ mode: 'match', tournamentName: '測試賽', roundName: 'Round 1', playerA: 'A', playerB: 'B' });
expect(matchMarkup.includes('data-match-sync-error') && matchMarkup.includes('role="alert"'), '正式記分板提供同步失敗提示區');
expect(scoreboardSource.includes('options.onScoreChange?.(current.scoreA, current.scoreB)'), '比分每次調整都回存 owning controller draft');
expect(scoreboardSource.includes("button.textContent = '重新送出比分'"), '同步失敗後提供明確的重新送出按鈕文案');
expect(scoreboardSource.includes('const canonicalScore = () => sidePlayers.a === options.playerA'), '交換邊後仍以原選手身分保存 canonical 比分');

console.log(`PASS ${assertions} formal score sync assertions`);

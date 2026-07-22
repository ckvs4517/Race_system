/** 首頁參賽上限與第一次使用說明頁的公開內容測試。 */
import assert from 'node:assert/strict';
import { homeView } from '../src/views/home.js';
import { guideView } from '../src/views/guide.js';
import { shell } from '../src/ui/shell.js';

const home = homeView(5, false);
assert.match(home, />32<\/b><span>最多參賽人數/, '首頁顯示最多 32 位參賽者');
assert.match(home, /data-route="guide"/, '首頁提供第一次使用入口');

const guide = guideView(false);
assert.match(guide, /五步完成一場賽事/, '說明頁提供五步流程');
assert.match(guide, /2～32 位選手/, '說明頁說明參賽人數範圍');
assert.match(guide, /未出席或中途退賽成立後不可恢復/, '說明頁標示不可逆退賽規則');
assert.match(shell('guide', guide, { isAdmin: false }), /nav-item active[^>]*data-route="guide"/, '導覽列可開啟並標示使用說明頁');

console.log('PASS getting started guide');

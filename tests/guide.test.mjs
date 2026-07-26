/** 首頁參賽上限與第一次使用說明頁的公開內容測試。 */
import assert from 'node:assert/strict';
import { homeView } from '../src/views/home.js';
import { guideView } from '../src/views/guide.js';
import { shell } from '../src/ui/shell.js';

const home = homeView(5, false);
assert.match(home, />32<\/b><span>最多參賽人數/, '首頁顯示最多 32 位參賽者');
assert.match(home, /data-route="guide"/, '首頁提供第一次使用入口');

const guide = guideView(false);
assert.match(guide, /六步完成一場賽事/, '說明頁提供六步流程');
assert.match(guide, /單淘汰支援 2～32 位，瑞士制支援 4～32 位/, '說明頁說明兩種賽制的人數範圍');
assert.match(guide, /未出席或中途退賽成立後不可恢復/, '說明頁標示不可逆退賽規則');
assert.match(guide, /未報到者不會排入賽程/, '說明頁包含賽前報到規則');
assert.match(guide, /報到階段不會提前排賽程/, '說明頁包含延後產生賽程的規則');
assert.match(guide, /逐場更換誰對誰/, '說明頁包含手動調整對戰的操作');
assert.match(guide, /舊網址會撤銷/, '說明頁包含報名網址撤銷規則');
assert.match(guide, /建立公開報名連結/, '說明頁包含賽事內快速開放報名');
assert.match(guide, /管理名單/, '說明頁說明安全移除模式');
assert.match(guide, /賽事開始時仍會自動停止收件/, '說明頁解釋未填截止時間的關閉規則');
assert.match(guide, /返回.*回到原賽事/, '說明頁解釋報名管理的返回行為');
assert.match(shell('guide', guide, { isAdmin: false }), /nav-item active[^>]*data-route="guide"/, '導覽列可開啟並標示使用說明頁');

console.log('PASS getting started guide');

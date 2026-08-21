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
assert.match(guide, /單淘汰支援 2～32 位、瑞士制 4～32 位，循環賽與連勝制則支援 3～8 位/, '說明頁說明四種賽制的人數範圍');
assert.match(guide, /未出席或中途退賽成立後不可恢復/, '說明頁標示不可逆退賽規則');
assert.match(guide, /未報到者不會排入賽程/, '說明頁包含賽前報到規則');
assert.match(guide, /報到階段不會提前排賽程/, '說明頁包含延後產生賽程的規則');
assert.match(guide, /逐場更換誰對誰/, '說明頁包含手動調整對戰的操作');
assert.match(guide, /舊網址會撤銷/, '說明頁包含報名網址撤銷規則');
assert.match(guide, /建立私密填寫連結/, '說明頁包含私密參賽資料流程');
assert.match(guide, /管理名單/, '說明頁說明安全移除模式');
assert.match(guide, /進入排程時舊網址會撤銷/, '說明頁解釋未填截止時間的關閉規則');
assert.match(guide, /送出後會直接加入正式名單/, '說明頁解釋填寫後不需核准');
const guideShell = shell('guide', guide, { isAdmin: false });
assert.match(guideShell, /nav-item active[^>]*data-route="guide"/, '導覽列可開啟並標示使用說明頁');
assert.match(guideShell, /BUILD DEV/, '原始碼預覽時頁尾顯示開發版本標記');

console.log('PASS getting started guide');

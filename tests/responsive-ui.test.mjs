/** 靜態檢查手機優先 UI 的字級、觸控範圍與主要響應式重排規則。 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const css = await readFile(new URL('../src/styles/app.css', import.meta.url), 'utf8');
const scheduleResponsiveCss = await readFile(new URL('../src/styles/schedule-responsive.css', import.meta.url), 'utf8');
const indexHtml = await readFile(new URL('../index.html', import.meta.url), 'utf8');

assert.match(css, /Touch-first usability overrides/, '存在觸控優先樣式區段');
assert.match(css, /body\s*\{[^}]*font-size:\s*16px/s, '正文基準至少 16px');
assert.match(css, /button, input, textarea, select\s*\{[^}]*font-size:\s*16px/s, '表單避免使用過小字體');
assert.match(css, /\.participant-row button\s*\{[^}]*min-height:\s*44px/s, '退賽操作符合觸控高度');
assert.match(css, /\.event-copy, \.event-delete\s*\{[^}]*min-height:\s*44px/s, '賽事操作符合觸控高度');
assert.match(css, /@media \(max-width: 900px\)/, '具備平板版面');
assert.match(css, /@media \(max-width: 620px\)[\s\S]*nav\s*\{[^}]*overflow-x:\s*auto/s, '手機導覽可水平滑動');
assert.match(css, /\.participant-row > div\s*\{[^}]*grid-column:\s*1 \/ -1/s, '手機選手操作移到獨立一列');
assert.match(css, /\.leaderboard-row\s*\{[^}]*min-width:\s*0/s, '手機排行榜不再強制桌面寬度');
assert.match(css, /\.check-in-row\[hidden\]\s*\{[^}]*display:\s*none\s*!important/s, '名單篩選結果會真正隱藏不符合的選手');
assert.match(css, /\.mobile-sheet-card \.drink-choice input\[type="radio"\][\s\S]*?min-width:\s*20px/s, '新增選手對話框的飲品單選鈕不會被全寬輸入樣式拉伸');
assert.match(css, /@media \(max-width: 620px\)[\s\S]*?\.drink-option-list[\s\S]*?grid-template-columns:\s*1fr/s, '手機飲品選項會單欄排列');
assert.match(css, /\.result-share-card\s*\{[^}]*width:\s*1080px[^}]*height:\s*1350px/s, '分享圖固定為 1080 × 1350');
assert.match(css, /\.result-share-card \.share-player h1\s*\{[^}]*text-overflow:\s*ellipsis/s, '長選手名稱在分享圖內會截斷');
assert.match(css, /\.result-share-card \.share-history\.is-compact/, '大量對戰紀錄有緊湊排版規則');
assert.match(indexHtml, /src\/styles\/schedule-responsive\.css/, '入口載入賽程手機修正樣式');
assert.match(scheduleResponsiveCss, /@media \(max-width: 620px\)[\s\S]*\.schedule-header-actions\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s, '手機賽程操作列使用兩欄避免四個操作互相擠壓');
assert.match(scheduleResponsiveCss, /\.schedule-header-actions > \.button\s*\{[^}]*white-space:\s*normal/s, '手機賽程按鈕允許文字換行而不爆框');
assert.match(scheduleResponsiveCss, /\.schedule-header-actions > \.schedule-more\s*\{[^}]*grid-column:\s*2/s, '更多按鈕固定在第二欄，避免三到四個操作錯位');

console.log('PASS responsive UI safeguards');

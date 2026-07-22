/** 靜態檢查手機優先 UI 的字級、觸控範圍與主要響應式重排規則。 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const css = await readFile(new URL('../src/styles/app.css', import.meta.url), 'utf8');

assert.match(css, /Touch-first usability overrides/, '存在觸控優先樣式區段');
assert.match(css, /body\s*\{[^}]*font-size:\s*16px/s, '正文基準至少 16px');
assert.match(css, /button, input, textarea, select\s*\{[^}]*font-size:\s*16px/s, '表單避免使用過小字體');
assert.match(css, /\.participant-row button\s*\{[^}]*min-height:\s*44px/s, '退賽操作符合觸控高度');
assert.match(css, /\.event-copy, \.event-delete\s*\{[^}]*min-height:\s*44px/s, '賽事操作符合觸控高度');
assert.match(css, /@media \(max-width: 900px\)/, '具備平板版面');
assert.match(css, /@media \(max-width: 620px\)[\s\S]*nav\s*\{[^}]*overflow-x:\s*auto/s, '手機導覽可水平滑動');
assert.match(css, /\.participant-row > div\s*\{[^}]*grid-column:\s*1 \/ -1/s, '手機選手操作移到獨立一列');
assert.match(css, /\.leaderboard-row\s*\{[^}]*min-width:\s*0/s, '手機排行榜不再強制桌面寬度');

console.log('PASS responsive UI safeguards');

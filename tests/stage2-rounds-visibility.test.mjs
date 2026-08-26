/** 第二階段輪數欄位只應在選擇瑞士輪時顯示。 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../src/styles/app.css', import.meta.url), 'utf8');

assert.match(main, /roundsField\.style\.display = showRounds \? '' : 'none'/, '非瑞士輪時應用 inline display:none 隱藏輪數欄位');
assert.match(main, /roundsInput\.disabled = !showRounds/, '非瑞士輪時輪數 input 應停用');
assert.match(css, /\[data-stage2-rounds\]\[hidden\]\s*\{\s*display:\s*none\s*!important;\s*\}/, 'CSS 應確保 hidden 不被 .field display 規則覆蓋');

console.log('PASS Stage 2 rounds visibility');

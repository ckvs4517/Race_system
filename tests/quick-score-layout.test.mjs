/** 快速登分 responsive layout regression：手機維持 inline，桌機不可受 match card 窄欄限制。 */
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/styles/quick-score-inline.css', import.meta.url), 'utf8');
let assertions = 0;
const expect = (condition, message) => {
  if (!condition) throw new Error(message);
  assertions += 1;
};

expect(css.includes('@media (min-width: 900px)'), '桌機有獨立快速登分 breakpoint');
expect(css.includes('position: fixed;') && css.includes('width: clamp(380px, 34vw, 520px);'), '桌機快速登分使用獨立寬版浮動面板');
expect(css.includes('grid-template-columns: repeat(2, minmax(0, 1fr));'), '桌機兩位選手可並排顯示');
expect(css.includes('grid-template-columns: repeat(7, minmax(0, 1fr));'), '桌機 0～6 分數鍵保持完整單列');
expect(css.includes('@media (max-width: 620px)') && css.includes('repeat(auto-fit, minmax(42px, 1fr))'), '手機仍使用可自動換列的 inline 版分數鍵');

console.log(`PASS ${assertions} quick score layout assertions`);

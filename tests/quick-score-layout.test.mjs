/** 快速登分 responsive layout regression：手機 inline、平板置中 compact、桌機右側寬版。 */
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/styles/quick-score-inline.css', import.meta.url), 'utf8');
let assertions = 0;
const expect = (condition, message) => {
  if (!condition) throw new Error(message);
  assertions += 1;
};

expect(css.includes('@media (min-width: 768px) and (max-width: 1199px)'), '平板有獨立快速登分 breakpoint');
expect(css.includes('width: min(680px, calc(100vw - 48px));') && css.includes('transform: translateX(-50%);'), '平板使用置中 compact 浮層，不受 match card 窄欄限制');
expect(css.includes('@media (min-width: 1200px)'), '桌機浮動面板只在真正桌機寬度啟用');
expect(css.includes('width: clamp(380px, 34vw, 520px);'), '桌機快速登分使用獨立寬版浮動面板');
expect(css.includes('grid-template-columns: repeat(2, minmax(0, 1fr));'), '平板與桌機兩位選手可並排顯示');
expect(css.includes('grid-template-columns: repeat(7, minmax(0, 1fr));'), '平板與桌機 0～6 分數鍵保持完整單列');
expect(css.includes('@media (max-width: 620px)') && css.includes('repeat(auto-fit, minmax(42px, 1fr))'), '手機仍使用可自動換列的 inline 版分數鍵');
expect(!css.includes('@media (min-width: 900px)'), '不再把直式平板誤判成桌機浮動版');

console.log(`PASS ${assertions} quick score layout assertions`);

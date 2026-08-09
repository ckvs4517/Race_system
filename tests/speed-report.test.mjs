/** 轉速報告折線圖與 JPEG-to-PDF 封裝器的零依賴回歸測試。 */
import { buildPdfBytesFromJpegs } from '../src/export/jpeg-pdf.js';
import { speedLineChartSvg } from '../src/ui/speed-chart.js';

const svg = speedLineChartSvg([{ shootPower: 10000 }, { shootPower: 11500 }, { shootPower: 10800 }]);
assert(svg.includes('<polyline'), '有資料時輸出折線圖');
assert(svg.includes('#1') && svg.includes('#3'), '折線圖保留發射序號');
assert(speedLineChartSvg([]).includes('等待第一筆 Shoot Power'), '無資料時顯示等待狀態');

const jpeg = Uint8Array.from([0xFF, 0xD8, 0xFF, 0xD9]);
const pdf = buildPdfBytesFromJpegs([jpeg, jpeg], 1, 1);
const text = new TextDecoder().decode(pdf);
assert(text.startsWith('%PDF-1.4'), 'PDF 輸出包含標準 header');
assert(text.includes('/Type /Pages /Count 2'), 'PDF 正確建立兩頁 page tree');
assert(text.includes('/Filter /DCTDecode'), 'PDF 以 JPEG image XObject 封裝頁面');
assert(text.includes('xref') && text.includes('startxref') && text.endsWith('%%EOF\n'), 'PDF 包含 xref 與 EOF');

console.log('PASS speed-report tests');

function assert(condition, message) { if (!condition) throw new Error(message); console.log(`PASS ${message}`); }

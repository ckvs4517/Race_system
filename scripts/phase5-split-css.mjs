import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const sourcePath = 'src/styles/app.css';
const source = await readFile(sourcePath, 'utf8');

const parts = [
  { file: 'base/foundation.css', marker: null },
  { file: 'features/scoreboard.css', marker: '\n.scoreboard { display: grid;' },
  { file: 'features/tournament-management.css', marker: '\n.setup-layout { display: grid;' },
  { file: 'features/schedule.css', marker: '\n.event-grid { display: grid;' },
  { file: 'base/footer.css', marker: '\nfooter { min-height: 62px;' },
  { file: 'responsive/global.css', marker: '\n@media (max-width: 900px) {\n  .event-info-facts' },
  { file: 'features/quick-score.css', marker: '\n/* 主控快速登分：模式只影響目前裝置的賽程互動，不改賽事資料。 */' },
  { file: 'features/guide.css', marker: '\n/* 第一次使用者說明頁 */' },
  { file: 'features/share-card.css', marker: '\n/* 分享圖只使用一份 4:5 DOM 模板；文字以截斷與緊湊紀錄避免長名稱或大量對戰破版。 */' },
  { file: 'features/speedometer.css', marker: '\n/* SpinLab / Battle Pass 轉速表 / Performance Lab */' },
  { file: 'features/registration.css', marker: '\n/* 公開報名與瑞士制四強決策 */' },
  { file: 'features/schedule-responsive.css', marker: '\n@media (max-width: 760px) {\n  .tournament-workflow' },
];

const starts = parts.map((part, index) => {
  if (index === 0) return 0;
  const first = source.indexOf(part.marker);
  const second = source.indexOf(part.marker, first + 1);
  if (first < 0) throw new Error(`Missing Phase 5 CSS split marker for ${part.file}`);
  if (second >= 0) throw new Error(`Ambiguous Phase 5 CSS split marker for ${part.file}`);
  return first + 1;
});

for (let index = 1; index < starts.length; index += 1) {
  if (starts[index] <= starts[index - 1]) throw new Error(`Out-of-order CSS marker at ${parts[index].file}`);
}

const chunks = parts.map((part, index) => ({
  ...part,
  content: source.slice(starts[index], starts[index + 1] ?? source.length),
}));

if (chunks.map((chunk) => chunk.content).join('') !== source) {
  throw new Error('Phase 5 CSS split changed source bytes before writing files.');
}

for (const chunk of chunks) {
  const target = path.join('src/styles', chunk.file);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, chunk.content, 'utf8');
}

const manifest = [
  '/* Spin League V2 Phase 5 style manifest. Keep imports in this order to preserve the legacy cascade. */',
  ...parts.map((part) => `@import url('./${part.file}');`),
  '',
].join('\n');
await writeFile(sourcePath, manifest, 'utf8');

const expanded = chunks.map((chunk) => chunk.content).join('');
if (expanded !== source) throw new Error('Expanded Phase 5 CSS does not match the original stylesheet.');

const boundaryTest = `/** V2 Phase 5: app.css stays a thin ordered style manifest. */\nimport assert from 'node:assert/strict';\nimport { readFile, stat } from 'node:fs/promises';\n\nconst appUrl = new URL('../src/styles/app.css', import.meta.url);\nconst source = await readFile(appUrl, 'utf8');\nconst info = await stat(appUrl);\nassert.ok(info.size < 2_000, \\`app.css should stay a thin style manifest; current size is \\${info.size} bytes\\`);\nassert.ok(!source.includes('{'), 'app.css must not regain concrete style rules');\n\nconst expected = ${JSON.stringify(parts.map((part) => `./${part.file}`), null, 2)};\nconst imports = [...source.matchAll(/@import\\s+url\\(['\"]([^'\"]+)['\"]\\);/g)].map((match) => match[1]);\nassert.deepEqual(imports, expected, 'Phase 5 stylesheet import order is part of the visual compatibility contract');\n\nfor (const relative of imports) {\n  const fileUrl = new URL(\\`../src/styles/\\${relative.slice(2)}\\`, import.meta.url);\n  const moduleSource = await readFile(fileUrl, 'utf8');\n  const moduleInfo = await stat(fileUrl);\n  assert.ok(moduleSource.trim().length > 0, \\`\\${relative} must not be empty\\`);\n  assert.ok(!moduleSource.includes('@import'), \\`\\${relative} must not create nested style import chains\\`);\n  assert.ok(moduleInfo.size < 35_000, \\`\\${relative} is too large for a Phase 5 responsibility module (\\${moduleInfo.size} bytes)\\`);\n}\n\nconsole.log(\\`PASS V2 CSS boundary (\\${imports.length} ordered style modules)\\`);\n`;
await writeFile('tests/v2-css-boundary.test.mjs', boundaryTest, 'utf8');

const fastPath = 'scripts/test-fast.mjs';
let fast = await readFile(fastPath, 'utf8');
if (!fast.includes("'tests/v2-css-boundary.test.mjs'")) {
  const anchor = "  'tests/v2-worker-boundary.test.mjs',\n";
  if (!fast.includes(anchor)) throw new Error('Cannot find fast-test insertion point for Phase 5 boundary test.');
  fast = fast.replace(anchor, `${anchor}  'tests/v2-css-boundary.test.mjs',\n`);
  await writeFile(fastPath, fast, 'utf8');
}

console.log(`PASS Phase 5 CSS migration: ${source.length} bytes preserved across ${chunks.length} ordered modules.`);
for (const chunk of chunks) console.log(`${chunk.file}: ${Buffer.byteLength(chunk.content)} bytes`);

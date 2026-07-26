/** 快速檢查 repository 的 AI 規則、Sites 身分與必要檔案是否完整。 */
import { access, readFile } from 'node:fs/promises';

const required = [
  'AGENTS.md',
  '.agents/skills/spin-league-debug/SKILL.md',
  '.agents/skills/spin-league-test/SKILL.md',
  '.agents/skills/spin-league-deploy/SKILL.md',
  '.agents/skills/spin-league-backup/SKILL.md',
  '.openai/hosting.json',
  'src/domain/tournament.js',
  'src/formats/swiss.js',
  'src/formats/single-elimination.js',
  'worker/index.js',
];

const errors = [];
for (const path of required) {
  try { await access(path); } catch { errors.push(`Missing ${path}`); }
}

try {
  const hosting = JSON.parse(await readFile('.openai/hosting.json', 'utf8'));
  if (!hosting.project_id) errors.push('hosting.json is missing project_id.');
  if (hosting.d1 !== 'DB') errors.push(`hosting.json D1 binding must be DB, found ${JSON.stringify(hosting.d1)}.`);
} catch (error) {
  errors.push(`Cannot parse hosting.json: ${error.message}`);
}

const worker = await readFile('worker/index.js', 'utf8');
if (!worker.includes("from '../src/domain/tournament.js'")) errors.push('Worker shared domain import changed; update build-site.mjs packaging rule.');

if (errors.length) {
  errors.forEach((message) => console.error(`ERROR ${message}`));
  process.exitCode = 1;
} else {
  console.log(`PASS project health: ${required.length} required files, Sites identity, and Worker packaging import.`);
}

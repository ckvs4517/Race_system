/** 快速檢查 repository 的 AI 規則、架構契約、Sites 身分與必要檔案是否完整。 */
import { access, readFile } from 'node:fs/promises';

const required = [
  'AGENTS.md',
  'ARCHITECTURE.md',
  '.github/pull_request_template.md',
  '.agents/skills/spin-league-debug/SKILL.md',
  '.agents/skills/spin-league-test/SKILL.md',
  '.agents/skills/spin-league-deploy/SKILL.md',
  '.agents/skills/spin-league-backup/SKILL.md',
  '.openai/hosting.json',
  'scripts/check-architecture.mjs',
  'src/domain/tournament.js',
  'src/formats/swiss.js',
  'src/formats/single-elimination.js',
  'worker/index.js',
  'worker/tournament-domain.js',
  'worker/routes/api.js',
  'worker/services/tournament-actions.js',
  'worker/db/tournaments.js',
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

const workerEntry = await readFile('worker/index.js', 'utf8');
if (!workerEntry.includes("from './routes/api.js'")) errors.push('Worker entry must delegate API routing to worker/routes/api.js.');
const workerDomainBridge = await readFile('worker/tournament-domain.js', 'utf8');
if (!workerDomainBridge.includes("from '../src/domain/tournament.js'")) errors.push('Worker tournament domain bridge changed; update build-site.mjs packaging rule.');

const agents = await readFile('AGENTS.md', 'utf8');
if (!agents.includes('ARCHITECTURE.md')) errors.push('AGENTS.md must point agents to ARCHITECTURE.md.');
if (!agents.includes('npm run check:architecture')) errors.push('AGENTS.md must require the architecture check.');

const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
if (packageJson.scripts?.['check:architecture'] !== 'node scripts/check-architecture.mjs') {
  errors.push('package.json must expose npm run check:architecture.');
}
if (!packageJson.scripts?.health) errors.push('package.json must expose npm run health.');

if (errors.length) {
  errors.forEach((message) => console.error(`ERROR ${message}`));
  process.exitCode = 1;
} else {
  console.log(`PASS project health: ${required.length} required files, V2 architecture contract, Sites identity, and Worker packaging bridge.`);
}

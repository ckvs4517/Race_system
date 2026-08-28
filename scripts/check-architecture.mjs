/**
 * Spin League V2 architecture guard.
 *
 * Rules are tightened as each migration phase lands so migrated
 * responsibilities cannot drift back into legacy hotspots.
 */
import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const errors = [];
const warnings = [];

const HOTSPOT_BASELINES = new Map([
  ['src/main.js', 42035],
  ['worker/index.js', 29513],
  ['src/styles/app.css', 106621],
]);

const MIGRATED_FILE_LIMITS = new Map([
  ['src/views/schedule.js', 2_000],
  ['src/domain/tournament.js', 1_000],
]);
const SCHEDULE_MODULE_SOFT_LIMIT = 15_000;
const SCHEDULE_MODULE_HARD_LIMIT = 20_000;
const TOURNAMENT_MODULE_SOFT_LIMIT = 12_000;
const TOURNAMENT_MODULE_HARD_LIMIT = 18_000;
const MAX_HOTSPOT_GROWTH = 1.05;
const GENERIC_MODULE_NAMES = new Set([
  'utils.js',
  'helpers.js',
  'common.js',
  'misc.js',
  'shared.js',
]);

const PURE_LAYER_FORBIDDEN_SEGMENTS = [
  '/views/',
  '/ui/',
  '/features/',
  '/data/',
  '/app/',
  '/services/',
  '/export/',
];

const browserRuntimePatterns = [
  { regex: /\bwindow\s*\./, label: 'window' },
  { regex: /\bdocument\s*\./, label: 'document' },
  { regex: /\bnavigator\s*\./, label: 'navigator' },
  { regex: /\blocalStorage\b/, label: 'localStorage' },
  { regex: /\bsessionStorage\b/, label: 'sessionStorage' },
  { regex: /\bfetch\s*\(/, label: 'fetch' },
];

const toPosix = (value) => value.split(path.sep).join('/');

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(absolute));
    else files.push(absolute);
  }
  return files;
}

async function existingTree(relativeDirectory) {
  try {
    await access(relativeDirectory);
    return await walk(relativeDirectory);
  } catch {
    return [];
  }
}

const sourceFiles = [
  ...await existingTree('src'),
  ...await existingTree('worker'),
];

const jsFiles = sourceFiles
  .filter((file) => /\.(?:m?js)$/.test(file))
  .map((file) => toPosix(path.relative(root, file)));

const jsFileSet = new Set(jsFiles);
const sourceCache = new Map();

async function sourceOf(relativePath) {
  if (!sourceCache.has(relativePath)) {
    sourceCache.set(relativePath, await readFile(relativePath, 'utf8'));
  }
  return sourceCache.get(relativePath);
}

function extractSpecifiers(source) {
  const values = [];
  const staticPattern = /\b(?:import|export)\s+(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/g;
  const dynamicPattern = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const pattern of [staticPattern, dynamicPattern]) {
    let match;
    while ((match = pattern.exec(source))) values.push(match[1]);
  }
  return values;
}

function resolveRelativeImport(fromFile, specifier) {
  if (!specifier.startsWith('.')) return null;
  const candidate = toPosix(path.normalize(path.join(path.dirname(fromFile), specifier)));
  const options = path.extname(candidate)
    ? [candidate]
    : [`${candidate}.js`, `${candidate}.mjs`, `${candidate}/index.js`];
  return options.find((item) => jsFileSet.has(item)) || null;
}

function isPureLayer(file) {
  return file.startsWith('src/domain/') || file.startsWith('src/formats/');
}

// 1. Generic dumping-ground modules are forbidden under src/.
for (const file of jsFiles.filter((item) => item.startsWith('src/'))) {
  if (GENERIC_MODULE_NAMES.has(path.posix.basename(file))) {
    errors.push(`${file}: generic module name is forbidden; use a responsibility-specific name.`);
  }
}

// 2. Domain/format code must stay browser- and network-independent.
for (const file of jsFiles.filter(isPureLayer)) {
  const source = await sourceOf(file);

  for (const rule of browserRuntimePatterns) {
    if (rule.regex.test(source)) {
      errors.push(`${file}: pure domain/format code must not use ${rule.label}.`);
    }
  }

  for (const specifier of extractSpecifiers(source)) {
    const resolved = resolveRelativeImport(file, specifier);
    if (!resolved) continue;
    const normalized = `/${resolved}`;
    if (PURE_LAYER_FORBIDDEN_SEGMENTS.some((segment) => normalized.includes(segment))) {
      errors.push(`${file}: forbidden pure-layer dependency on ${resolved}.`);
    }
  }
}

// 3. Relative JavaScript module cycles are hard failures.
const graph = new Map(jsFiles.map((file) => [file, []]));
for (const file of jsFiles) {
  const source = await sourceOf(file);
  const targets = extractSpecifiers(source)
    .map((specifier) => resolveRelativeImport(file, specifier))
    .filter(Boolean);
  graph.set(file, [...new Set(targets)]);
}

const permanent = new Set();
const active = new Set();
const stack = [];
const reportedCycles = new Set();

function visit(file) {
  if (permanent.has(file)) return;
  if (active.has(file)) {
    const start = stack.indexOf(file);
    const cycle = [...stack.slice(start), file];
    const canonical = cycle.slice(0, -1).sort().join('|');
    if (!reportedCycles.has(canonical)) {
      reportedCycles.add(canonical);
      errors.push(`Circular module dependency: ${cycle.join(' -> ')}`);
    }
    return;
  }

  active.add(file);
  stack.push(file);
  for (const target of graph.get(file) || []) visit(target);
  stack.pop();
  active.delete(file);
  permanent.add(file);
}

for (const file of jsFiles) visit(file);

// 4. Legacy hotspots may shrink freely, but they must not keep expanding.
for (const [file, baseline] of HOTSPOT_BASELINES) {
  try {
    const content = await readFile(file);
    const size = content.byteLength;
    const hardLimit = Math.floor(baseline * MAX_HOTSPOT_GROWTH);
    if (size > hardLimit) {
      errors.push(`${file}: ${size} bytes exceeds the V2 hotspot hard limit ${hardLimit} bytes (baseline ${baseline}). Extract responsibilities instead of expanding the hotspot.`);
    } else if (size > baseline) {
      warnings.push(`${file}: ${size} bytes is above the V2 baseline ${baseline}; prefer extracting responsibility in the next change.`);
    }
  } catch {
    // A hotspot disappearing during refactor is a valid outcome.
  }
}

// 5. Migrated façades must stay thin after their phase is complete.
for (const [file, hardLimit] of MIGRATED_FILE_LIMITS) {
  try {
    const content = await readFile(file);
    const size = content.byteLength;
    if (size > hardLimit) {
      errors.push(`${file}: ${size} bytes exceeds the migrated façade limit ${hardLimit} bytes. Keep orchestration thin and put view responsibilities in the owning modules.`);
    }
  } catch {
    errors.push(`${file}: migrated architecture façade is missing.`);
  }
}

// 6. Phase 2 schedule modules are bounded so the old monolith cannot reappear under a new filename.
for (const file of jsFiles.filter((item) => item.startsWith('src/views/schedule/'))) {
  const content = await readFile(file);
  const size = content.byteLength;
  if (size > SCHEDULE_MODULE_HARD_LIMIT) {
    errors.push(`${file}: ${size} bytes exceeds the schedule module hard limit ${SCHEDULE_MODULE_HARD_LIMIT}; split the responsibility before adding more behavior.`);
  } else if (size > SCHEDULE_MODULE_SOFT_LIMIT) {
    warnings.push(`${file}: ${size} bytes is approaching the schedule module hard limit; consider a responsibility split.`);
  }
}

// 7. Phase 3 tournament modules are bounded so the domain monolith cannot reappear behind the facade.
for (const file of jsFiles.filter((item) => item.startsWith('src/domain/tournament/'))) {
  const content = await readFile(file);
  const size = content.byteLength;
  if (size > TOURNAMENT_MODULE_HARD_LIMIT) {
    errors.push(`${file}: ${size} bytes exceeds the tournament-domain module hard limit ${TOURNAMENT_MODULE_HARD_LIMIT}; split the responsibility before adding more behavior.`);
  } else if (size > TOURNAMENT_MODULE_SOFT_LIMIT) {
    warnings.push(`${file}: ${size} bytes is approaching the tournament-domain module hard limit; consider a responsibility split.`);
  }
}

// 8. Guardrail files themselves are part of the architecture contract.
for (const required of ['ARCHITECTURE.md', 'AGENTS.md']) {
  try { await access(required); } catch { errors.push(`Missing architecture contract file: ${required}`); }
}

for (const warning of warnings) console.warn(`WARN ${warning}`);

if (errors.length) {
  for (const error of errors) console.error(`ERROR ${error}`);
  console.error(`FAIL architecture: ${errors.length} error(s), ${warnings.length} warning(s).`);
  process.exitCode = 1;
} else {
  console.log(`PASS architecture: ${jsFiles.length} JS modules checked, 0 dependency violations, 0 cycles, ${warnings.length} warning(s).`);
}

/** 產生 Sites 部署目錄；使用 Node fs，確保 Windows 與 CI 的檔案複製結果一致。 */
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveSourceVersion, sourceVersionToken } from './lib/source-version.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(projectRoot, 'dist');
if (!dist.startsWith(`${projectRoot}${sep}`)) throw new Error('Invalid build output path.');

const serverDir = join(dist, 'server');
const clientDir = join(dist, 'client');
const drizzleDir = join(dist, '.openai', 'drizzle');
const sourceVersion = await resolveSourceVersion({ cwd: projectRoot });
const buildVersion = sourceVersionToken(sourceVersion);

await rm(dist, { recursive: true, force: true });
await Promise.all([
  mkdir(serverDir, { recursive: true }),
  mkdir(join(serverDir, 'routes'), { recursive: true }),
  mkdir(join(serverDir, 'services'), { recursive: true }),
  mkdir(join(serverDir, 'db'), { recursive: true }),
  mkdir(clientDir, { recursive: true }),
  mkdir(drizzleDir, { recursive: true }),
  mkdir(join(clientDir, 'node_modules', 'html-to-image', 'dist'), { recursive: true }),
]);

await Promise.all([
  cp(join(projectRoot, 'worker', 'index.js'), join(serverDir, 'index.js')),
  cp(join(projectRoot, 'worker', 'routes'), join(serverDir, 'routes'), { recursive: true }),
  cp(join(projectRoot, 'worker', 'services'), join(serverDir, 'services'), { recursive: true }),
  cp(join(projectRoot, 'worker', 'db'), join(serverDir, 'db'), { recursive: true }),
  cp(join(projectRoot, 'worker', 'tournament-domain.js'), join(serverDir, 'tournament-domain.js')),
  cp(join(projectRoot, 'src', 'domain'), join(serverDir, 'domain'), { recursive: true }),
  cp(join(projectRoot, 'src', 'formats'), join(serverDir, 'formats'), { recursive: true }),
  cp(join(projectRoot, 'index.html'), join(clientDir, 'index.html')),
  cp(join(projectRoot, 'src'), join(clientDir, 'src'), { recursive: true }),
  cp(join(projectRoot, 'node_modules', 'html-to-image', 'dist', 'html-to-image.js'), join(clientDir, 'node_modules', 'html-to-image', 'dist', 'html-to-image.js')),
  cp(join(projectRoot, '.openai', 'hosting.json'), join(dist, '.openai', 'hosting.json')),
]);

const domainBridgePath = join(serverDir, 'tournament-domain.js');
const domainBridgeSource = await readFile(domainBridgePath, 'utf8');
const packagedDomainBridge = domainBridgeSource.replace("from '../src/domain/tournament.js'", "from './domain/tournament.js'");
if (packagedDomainBridge === domainBridgeSource) throw new Error('Worker tournament domain bridge import was not found.');
await writeFile(domainBridgePath, packagedDomainBridge, 'utf8');

const buildInfoPath = join(clientDir, 'src', 'core', 'build-info.js');
const buildInfoToken = '__SPIN_BUILD_VERSION__';
const buildInfoSource = await readFile(buildInfoPath, 'utf8');
if (!buildInfoSource.includes(buildInfoToken)) throw new Error('Build version token was not found.');
await writeFile(buildInfoPath, buildInfoSource.replace(buildInfoToken, buildVersion), 'utf8');

const migrationNames = (await readdir(join(projectRoot, '.openai', 'drizzle'))).filter((name) => name.endsWith('.sql'));
await Promise.all(migrationNames.map((name) => cp(join(projectRoot, '.openai', 'drizzle', name), join(drizzleDir, name))));

const requiredFiles = [
  [join(serverDir, 'index.js'), 300],
  [join(serverDir, 'routes', 'api.js'), 5_000],
  [join(serverDir, 'services', 'tournament-actions.js'), 2_000],
  [join(serverDir, 'db', 'tournaments.js'), 1_000],
  [join(serverDir, 'tournament-domain.js'), 300],
  [join(serverDir, 'domain', 'tournament.js'), 50],
  [join(serverDir, 'domain', 'tournament', 'index.js'), 500],
  [join(serverDir, 'domain', 'tournament', 'lifecycle.js'), 3_000],
  [join(serverDir, 'domain', 'tournament', 'matches.js'), 2_000],
  [join(serverDir, 'formats', 'registry.js'), 100],
  [join(clientDir, 'index.html'), 500],
  [join(clientDir, 'src', 'main.js'), 4_000],
  [join(clientDir, 'src', 'features', 'schedule', 'controller.js'), 8_000],
  [join(clientDir, 'src', 'features', 'registration', 'controller.js'), 2_000],
  [join(clientDir, 'src', 'views', 'schedule', 'tournament-detail.js'), 3_000],
  [join(clientDir, 'src', 'views', 'schedule', 'rounds.js'), 4_000],
  [buildInfoPath, 100],
  [join(dist, '.openai', 'hosting.json'), 20],
];
for (const [path, minimumBytes] of requiredFiles) {
  const info = await stat(path);
  if (!info.isFile() || info.size < minimumBytes) throw new Error(`Invalid build artifact: ${path}`);
}

const packagedBuildInfo = await readFile(buildInfoPath, 'utf8');
if (packagedBuildInfo.includes(buildInfoToken)) throw new Error('Build version token was not replaced.');

console.log(`Build completed (${buildVersion}, resolved via ${sourceVersion.source}).`);

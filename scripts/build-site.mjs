/** 產生 Sites 部署目錄；使用 Node fs，確保 Windows 與 CI 的檔案複製結果一致。 */
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(projectRoot, 'dist');
if (!dist.startsWith(`${projectRoot}${sep}`)) throw new Error('Invalid build output path.');

const serverDir = join(dist, 'server');
const clientDir = join(dist, 'client');
const drizzleDir = join(dist, '.openai', 'drizzle');

await rm(dist, { recursive: true, force: true });
await Promise.all([
  mkdir(serverDir, { recursive: true }),
  mkdir(clientDir, { recursive: true }),
  mkdir(drizzleDir, { recursive: true }),
]);

const workerPath = join(projectRoot, 'worker', 'index.js');
const workerSource = await readFile(workerPath, 'utf8');
const packagedWorker = workerSource.replace(
  "from '../src/domain/tournament.js'",
  "from './domain/tournament.js'",
);
if (packagedWorker === workerSource) throw new Error('Worker shared-module import was not found.');

await Promise.all([
  writeFile(join(serverDir, 'index.js'), packagedWorker, 'utf8'),
  cp(join(projectRoot, 'src', 'domain'), join(serverDir, 'domain'), { recursive: true }),
  cp(join(projectRoot, 'src', 'formats'), join(serverDir, 'formats'), { recursive: true }),
  cp(join(projectRoot, 'index.html'), join(clientDir, 'index.html')),
  cp(join(projectRoot, 'src'), join(clientDir, 'src'), { recursive: true }),
  cp(join(projectRoot, '.openai', 'hosting.json'), join(dist, '.openai', 'hosting.json')),
]);

const migrationNames = (await readdir(join(projectRoot, '.openai', 'drizzle')))
  .filter((name) => name.endsWith('.sql'));
await Promise.all(migrationNames.map((name) =>
  cp(join(projectRoot, '.openai', 'drizzle', name), join(drizzleDir, name))));

const requiredFiles = [
  [join(serverDir, 'index.js'), 20_000],
  [join(serverDir, 'domain', 'tournament.js'), 20_000],
  [join(serverDir, 'formats', 'registry.js'), 100],
  [join(clientDir, 'index.html'), 500],
  [join(clientDir, 'src', 'main.js'), 10_000],
  [join(dist, '.openai', 'hosting.json'), 20],
];
for (const [path, minimumBytes] of requiredFiles) {
  const info = await stat(path);
  if (!info.isFile() || info.size < minimumBytes) {
    throw new Error(`Invalid build artifact: ${path}`);
  }
}

console.log('Build completed.');

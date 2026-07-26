/**
 * 隔離式本機開發伺服器：執行真實 Worker 與檔案型 D1 模擬器，不接觸正式環境。
 *
 * Examples:
 *   node scripts/preview-local.mjs
 *   node scripts/preview-local.mjs --backup ./backup.json --reset
 *   LOCAL_ADMIN_PIN=1357 node scripts/preview-local.mjs --host 0.0.0.0 --port 8765
 */
import { access, readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../worker/index.js';
import { LocalD1Database } from './lib/local-d1.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const host = argumentValue('--host') || process.env.HOST || '0.0.0.0';
const port = positiveInteger(argumentValue('--port') || process.env.PORT || '8765', 'port');
const dataPath = resolve(projectRoot, argumentValue('--data') || process.env.LOCAL_D1_PATH || '.dev-data/local-d1.json');
const backupArgument = argumentValue('--backup');
const backupPath = backupArgument ? resolve(process.cwd(), backupArgument) : null;
const reset = process.argv.includes('--reset');
const adminPin = process.env.LOCAL_ADMIN_PIN || '2468';
const tokenSecret = process.env.LOCAL_TOKEN_SECRET || 'spin-league-local-only-secret-change-me';

if (backupPath) await access(backupPath);
const database = new LocalD1Database(dataPath);
await database.initialize({ reset, backupPath });

const env = {
  DB: database,
  ADMIN_PIN: adminPin,
  TOKEN_SECRET: tokenSecret,
  ASSETS: { fetch: serveAsset },
};

const server = createServer(async (incoming, outgoing) => {
  try {
    const request = await toWebRequest(incoming);
    const response = await worker.fetch(request, env);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers.entries()));
    if (incoming.method === 'HEAD' || !response.body) {
      outgoing.end();
      return;
    }
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    console.error(error);
    outgoing.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    outgoing.end('Local preview server error');
  }
});

server.listen(port, host, () => {
  console.log('Spin League isolated local preview');
  console.log(`- Local: http://127.0.0.1:${port}/`);
  for (const address of lanAddresses()) console.log(`- LAN:   http://${address}:${port}/`);
  console.log(`- Admin PIN: ${adminPin} (local only)`);
  console.log(`- Local data: ${dataPath}`);
  if (backupPath) console.log(`- Preloaded backup: ${backupPath}`);
  console.log('- This server uses the real Worker code with a local file database and never contacts production.');
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}

async function serveAsset(request) {
  const url = new URL(request.url);
  const pathname = decodeURIComponent(url.pathname);
  const requestedPath = resolve(projectRoot, `.${pathname === '/' ? '/index.html' : pathname}`);
  if (requestedPath !== projectRoot && !requestedPath.startsWith(`${projectRoot}${sep}`)) {
    return new Response('Forbidden', { status: 403 });
  }
  try {
    const info = await stat(requestedPath);
    if (!info.isFile()) throw new Error('Not a file');
    return new Response(await readFile(requestedPath), {
      status: 200,
      headers: {
        'content-type': mimeType(requestedPath),
        'cache-control': 'no-store',
      },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}

async function toWebRequest(incoming) {
  const originHost = incoming.headers.host || `127.0.0.1:${port}`;
  const url = `http://${originHost}${incoming.url}`;
  const method = incoming.method || 'GET';
  const chunks = [];
  for await (const chunk of incoming) chunks.push(chunk);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  return new Request(url, {
    method,
    headers: incoming.headers,
    ...(body ? { body, duplex: 'half' } : {}),
  });
}

function mimeType(path) {
  return ({
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.pdf': 'application/pdf',
    '.svg': 'image/svg+xml',
  })[extname(path).toLowerCase()] || 'application/octet-stream';
}

function lanAddresses() {
  const results = [];
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family === 'IPv4' && !entry.internal) results.push(entry.address);
    }
  }
  return [...new Set(results)];
}

function argumentValue(name) {
  const inline = process.argv.find((value) => value.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function positiveInteger(value, label) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) throw new Error(`Invalid ${label}: ${value}`);
  return parsed;
}

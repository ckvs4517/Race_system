/** 零相依的本機靜態測試伺服器，供 Windows 與 CI 瀏覽器流程共用。 */
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const port = Number(process.env.TEST_PORT) || 8765;
const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, `http://${request.headers.host}`).pathname);
  const requestedPath = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
  if (requestedPath !== root && !requestedPath.startsWith(`${root}${sep}`)) {
    response.writeHead(403).end('Forbidden');
    return;
  }
  try {
    const info = await stat(requestedPath);
    if (!info.isFile()) throw new Error('Not a file');
    response.writeHead(200, {
      'content-type': mimeTypes[extname(requestedPath)] || 'application/octet-stream',
      'cache-control': 'no-store',
    });
    createReadStream(requestedPath).pipe(response);
  } catch {
    response.writeHead(404).end('Not found');
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`Test server listening on http://127.0.0.1:${port}`);
});

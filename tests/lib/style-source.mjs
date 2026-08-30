import { readFile } from 'node:fs/promises';

/** Read app.css as the browser sees it after resolving the Phase 5 ordered imports. */
export async function readAppStyles() {
  const appUrl = new URL('../../src/styles/app.css', import.meta.url);
  const manifest = await readFile(appUrl, 'utf8');
  const imports = [...manifest.matchAll(/@import\s+url\(['"]([^'"]+)['"]\);/g)].map((match) => match[1]);
  if (!imports.length) return manifest;
  const chunks = [];
  for (const relative of imports) chunks.push(await readFile(new URL(relative, appUrl), 'utf8'));
  return chunks.join('');
}

import { access, readdir } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export async function runCommand(label, command, args, options = {}) {
  const started = Date.now();
  const result = await capture(command, args, {
    cwd: options.cwd || projectRoot,
    env: { ...process.env, ...(options.env || {}) },
    timeoutMs: options.timeoutMs,
  });
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  if (result.code !== 0) {
    console.error(`FAIL ${label} (${elapsed}s)`);
    if (result.stdout.trim()) console.error(result.stdout.trimEnd());
    if (result.stderr.trim()) console.error(result.stderr.trimEnd());
    const error = new Error(`${label} failed with exit code ${result.code}`);
    error.result = result;
    throw error;
  }
  console.log(`PASS ${label} (${elapsed}s)`);
  return result;
}

export async function discoverNodeTests() {
  const names = await readdir(join(projectRoot, 'tests'));
  return names
    .filter((name) => name.endsWith('.test.mjs'))
    .sort()
    .map((name) => join('tests', name));
}

export async function findChrome() {
  const explicit = [process.env.CHROME_PATH, process.env.BROWSER_PATH].filter(Boolean);
  const candidates = [
    ...explicit,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    `${process.env.LOCALAPPDATA || ''}\\Google\\Chrome\\Application\\chrome.exe`,
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      await access(candidate, fsConstants.X_OK);
      return candidate;
    } catch {
      // Try the next known location.
    }
  }

  for (const command of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'chrome']) {
    const result = await capture(process.platform === 'win32' ? 'where' : 'which', [command]);
    if (result.code === 0) return result.stdout.trim().split(/\r?\n/)[0];
  }
  return null;
}

export async function waitForUrl(url, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (response.ok) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  throw new Error(`Local server did not become ready: ${lastError?.message || 'timeout'}`);
}

export function spawnBackground(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: options.cwd || projectRoot,
    env: { ...process.env, ...(options.env || {}) },
    stdio: options.stdio || ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  return child;
}

function capture(command, args, options = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const useProcessGroup = Boolean(options.timeoutMs) && process.platform !== 'win32';
    const child = spawn(command, args, {
      cwd: options.cwd || projectRoot,
      env: options.env || process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      detached: useProcessGroup,
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolvePromise(result);
    };
    const timer = options.timeoutMs ? setTimeout(() => {
      terminateProcessTree(child, useProcessGroup);
      child.stdout.destroy();
      child.stderr.destroy();
      child.unref();
      finish({
        code: 124,
        signal: 'TIMEOUT',
        stdout,
        stderr: `${stderr}\nCommand timed out after ${options.timeoutMs}ms.`,
      });
    }, options.timeoutMs) : null;
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      rejectPromise(error);
    });
    child.on('close', (code, signal) => finish({ code: code ?? 1, signal, stdout, stderr }));
  });
}

function terminateProcessTree(child, processGroup) {
  if (!child.pid) return;
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore', windowsHide: true });
    } else if (processGroup) {
      process.kill(-child.pid, 'SIGKILL');
    } else {
      child.kill('SIGKILL');
    }
  } catch {
    child.kill('SIGKILL');
  }
}

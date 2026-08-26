/** 回歸：Sites synthetic commit 不得被誤認為 GitHub source commit。 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveSourceVersion, sourceVersionToken } from '../scripts/lib/source-version.mjs';

const directory = await mkdtemp(join(tmpdir(), 'spin-source-version-'));
try {
  git(['init']);
  git(['config', 'user.email', 'spin-test@example.invalid']);
  git(['config', 'user.name', 'Spin League Test']);
  await writeFile(join(directory, 'app.js'), 'export const value = 1;\n');
  git(['add', 'app.js']);
  git(['commit', '-m', 'Source commit']);

  const sourceSha = git(['rev-parse', 'HEAD']);
  const sourceTree = git(['rev-parse', 'HEAD^{tree}']);
  git(['update-ref', 'refs/remotes/origin/v2/codebase-refactor', sourceSha]);

  // 模擬 Sites：建立內容完全相同、但 SHA 不同的內部 synthetic commit。
  const syntheticSha = git(['commit-tree', sourceTree, '-p', sourceSha, '-m', 'Sites synthetic build commit']);
  assert.notEqual(syntheticSha, sourceSha);
  git(['reset', '--hard', syntheticSha]);

  const resolved = await resolveSourceVersion({
    cwd: directory,
    env: {},
    fetchImpl: async () => { throw new Error('local remote tree match should resolve first'); },
  });
  assert.equal(resolved.kind, 'git');
  assert.equal(resolved.value, sourceSha, '應以相同 source tree 找回 GitHub commit，而不是 synthetic HEAD');
  assert.equal(sourceVersionToken(resolved), `git:${sourceSha}`);

  const environmentSha = '1234567890abcdef1234567890abcdef12345678';
  const fromEnvironment = await resolveSourceVersion({ cwd: directory, env: { SOURCE_COMMIT: environmentSha } });
  assert.equal(fromEnvironment.value, environmentSha, '明確的 source commit metadata 優先於 Git 檢測');

  git(['update-ref', '-d', 'refs/remotes/origin/v2/codebase-refactor']);
  const fromGitHubTree = await resolveSourceVersion({
    cwd: directory,
    env: {},
    fetchImpl: async () => ({
      ok: true,
      json: async () => [{ sha: sourceSha, commit: { tree: { sha: sourceTree } } }],
    }),
  });
  assert.equal(fromGitHubTree.kind, 'git');
  assert.equal(fromGitHubTree.value, sourceSha, '本地 refs 不足時可依 tree 從 GitHub metadata 找回 source commit');

  const treeOnly = await resolveSourceVersion({
    cwd: directory,
    env: {},
    fetchImpl: async () => ({ ok: true, json: async () => [] }),
  });
  assert.equal(treeOnly.kind, 'tree');
  assert.equal(treeOnly.value, sourceTree);
  assert.match(sourceVersionToken(treeOnly), /^tree:[0-9a-f]{40}$/);
  assert.notEqual(treeOnly.value, syntheticSha, '無法驗證 commit 時只能標示 tree，不得顯示 synthetic SHA');
} finally {
  await rm(directory, { recursive: true, force: true });
}

console.log('PASS deployed source revision resolution');

function git(args) {
  return execFileSync('git', args, {
    cwd: directory,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

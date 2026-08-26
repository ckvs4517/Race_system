/**
 * 解析實際部署來源版本。
 * Sites 可能以內部 synthetic commit 建置，因此不能直接把 HEAD 當成 GitHub commit。
 */
import { execFileSync } from 'node:child_process';

const DEFAULT_REPOSITORY = 'ckvs4517/Race_system';
const SHA_PATTERN = /^[0-9a-f]{40}$/i;

export async function resolveSourceVersion({
  cwd,
  env = process.env,
  repository = DEFAULT_REPOSITORY,
  fetchImpl = globalThis.fetch,
} = {}) {
  const environmentSha = [
    env.GITHUB_SHA,
    env.SOURCE_COMMIT,
    env.COMMIT_SHA,
    env.SITES_SOURCE_COMMIT,
    env.OPENAI_SOURCE_COMMIT,
    env.OPENAI_GIT_COMMIT_SHA,
    env.GIT_COMMIT_SHA,
  ]
    .map((value) => String(value || '').trim())
    .find((value) => SHA_PATTERN.test(value));

  if (environmentSha) return gitVersion(environmentSha, false, 'environment');

  const headSha = git(cwd, ['rev-parse', 'HEAD']);
  const treeSha = git(cwd, ['rev-parse', 'HEAD^{tree}']);
  const dirty = Boolean(git(cwd, ['status', '--porcelain']));

  if (headSha && isCommitOnRemote(cwd, headSha)) {
    return gitVersion(headSha, dirty, 'remote-head');
  }

  if (treeSha) {
    const localMatch = findRemoteCommitByTree(cwd, treeSha);
    if (localMatch) return gitVersion(localMatch, dirty, 'remote-tree');

    const githubMatch = await findGitHubCommitByTree(repository, treeSha, fetchImpl);
    if (githubMatch) return gitVersion(githubMatch, dirty, 'github-tree');

    return {
      kind: 'tree',
      value: treeSha,
      short: treeSha.slice(0, 7).toLowerCase(),
      dirty,
      source: 'tree-fallback',
    };
  }

  return { kind: 'unknown', value: '', short: 'UNKNOWN', dirty, source: 'unknown' };
}

export function sourceVersionToken(version) {
  if (version.kind === 'git') return `git:${version.value}${version.dirty ? '+dirty' : ''}`;
  if (version.kind === 'tree') return `tree:${version.value}${version.dirty ? '+dirty' : ''}`;
  return 'unknown:UNKNOWN';
}

function gitVersion(sha, dirty, source) {
  const normalized = sha.toLowerCase();
  return {
    kind: 'git',
    value: normalized,
    short: normalized.slice(0, 7),
    dirty,
    source,
  };
}

function isCommitOnRemote(cwd, sha) {
  const refs = git(cwd, ['branch', '-r', '--contains', sha]);
  return Boolean(refs && refs.split(/\r?\n/).some((line) => line.trim() && !line.includes('->')));
}

function findRemoteCommitByTree(cwd, targetTree) {
  const commits = git(cwd, ['rev-list', '--remotes', '--max-count=500']);
  if (!commits) return '';
  for (const commit of commits.split(/\r?\n/).map((value) => value.trim()).filter(Boolean)) {
    const tree = git(cwd, ['rev-parse', `${commit}^{tree}`]);
    if (tree === targetTree) return commit;
  }
  return '';
}

async function findGitHubCommitByTree(repository, targetTree, fetchImpl) {
  if (typeof fetchImpl !== 'function') return '';
  try {
    for (let page = 1; page <= 3; page += 1) {
      const response = await fetchImpl(`https://api.github.com/repos/${repository}/commits?per_page=100&page=${page}`, {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'spin-league-build',
        },
      });
      if (!response?.ok) return '';
      const commits = await response.json();
      if (!Array.isArray(commits) || !commits.length) return '';
      const match = commits.find((item) => item?.commit?.tree?.sha === targetTree && SHA_PATTERN.test(item?.sha || ''));
      if (match) return match.sha;
      if (commits.length < 100) return '';
    }
  } catch {
    return '';
  }
  return '';
}

function git(cwd, args) {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

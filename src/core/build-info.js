const BUILD_VERSION = '__SPIN_BUILD_VERSION__';
const REPOSITORY_URL = 'https://github.com/ckvs4517/Race_system';

/**
 * 顯示可追溯的部署來源版本。
 * git: 代表已解析到 GitHub commit；tree: 代表只能確認 source tree，不冒充 commit SHA。
 */
export function buildVersionInfo() {
  if (BUILD_VERSION.startsWith('__')) {
    return {
      kind: 'dev',
      label: 'GIT DEV',
      href: REPOSITORY_URL,
      title: '本機原始碼預覽，尚未注入部署來源版本',
    };
  }

  const separator = BUILD_VERSION.indexOf(':');
  const kind = separator >= 0 ? BUILD_VERSION.slice(0, separator) : 'unknown';
  const rawValue = separator >= 0 ? BUILD_VERSION.slice(separator + 1) : BUILD_VERSION;
  const dirty = rawValue.endsWith('+dirty');
  const value = dirty ? rawValue.slice(0, -6) : rawValue;
  const suffix = dirty ? '+dirty' : '';

  if (kind === 'git' && /^[0-9a-f]{40}$/i.test(value)) {
    return {
      kind: 'git',
      label: `GIT ${value.slice(0, 7)}${suffix}`,
      href: `${REPOSITORY_URL}/commit/${value}`,
      title: `GitHub source commit ${value}${dirty ? '（本機建置時有未提交變更）' : ''}`,
    };
  }

  if (kind === 'tree' && /^[0-9a-f]{40}$/i.test(value)) {
    return {
      kind: 'tree',
      label: `TREE ${value.slice(0, 7)}${suffix}`,
      href: REPOSITORY_URL,
      title: '已確認部署 source tree，但建置環境無法可靠解析 GitHub commit；此值不是 commit SHA',
    };
  }

  return {
    kind: 'unknown',
    label: 'GIT UNKNOWN',
    href: REPOSITORY_URL,
    title: '無法解析部署來源版本',
  };
}

export function buildVersionLabel() {
  return buildVersionInfo().label;
}

const BUILD_VERSION = '__SPIN_BUILD_VERSION__';

/** 顯示部署來源版本；原始碼直接執行時使用 DEV，正式 build 會注入 commit SHA。 */
export function buildVersionLabel() {
  return BUILD_VERSION.startsWith('__') ? 'BUILD DEV' : `BUILD ${BUILD_VERSION}`;
}

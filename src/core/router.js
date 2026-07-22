/** 使用 URL hash 的極簡前端路由；不依賴任何框架或伺服器 rewrite。 */
const routes = new Set(['home', 'guide', 'scoreboard', 'schedule', 'manage', 'control', 'data']);

export function currentRoute() {
  const route = location.hash.replace('#', '').split('/')[0];
  return routes.has(route) ? route : 'home';
}

export function navigate(route) {
  location.hash = routes.has(route) ? route : 'home';
}

export function onRouteChange(callback) {
  window.addEventListener('hashchange', callback);
}

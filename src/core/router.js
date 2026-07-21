const routes = new Set(['home', 'scoreboard', 'schedule', 'manage']);

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

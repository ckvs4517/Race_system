import { icons } from './icons.js';

const navItems = [
  ['home', '首頁'],
  ['scoreboard', '記分板'],
  ['schedule', '賽程表'],
  ['manage', '賽事管理'],
];

export function shell(route, content) {
  return `
    <div class="ambient ambient-one"></div>
    <div class="ambient ambient-two"></div>
    <header class="topbar">
      <button class="brand" data-route="home" aria-label="返回首頁">
        <span class="brand-orbit"><i></i></span>
        <span class="brand-copy">SPIN <b>LEAGUE</b><small>TOURNAMENT SYSTEM</small></span>
      </button>
      <nav aria-label="主要導覽">
        ${navItems.map(([key, label]) => `<button class="nav-item ${route === key ? 'active' : ''}" data-route="${key}">${label}</button>`).join('')}
      </nav>
      <div class="system-state"><span></span> 系統就緒</div>
    </header>
    <main>${content}</main>
    <footer><span>SPIN LEAGUE © 2026</span><span>LOCAL MVP · ${icons.bolt} READY</span></footer>
  `;
}

export function pageHeader(kicker, title, description, action = '') {
  return `<div class="page-header"><div><p class="kicker">${kicker}</p><h1>${title}</h1><p class="page-description">${description}</p></div>${action}</div>`;
}

/** 所有頁面共用的導覽、同步狀態、主內容與頁尾框架。 */
import { icons } from './icons.js';

export function shell(route, content, state = {}) {
  const syncLabel = state.syncStatus === 'updated'
    ? '已取得最新賽果'
    : state.syncStatus === 'conflict'
      ? '已載入最新資料'
      : state.syncStatus === 'error'
        ? '同步暫時異常'
        : state.isAdmin ? '控制模式' : '公開模式';
  const navItems = [
    ['home', '首頁'],
    ['guide', '使用說明'],
    ['scoreboard', '記分板'],
    ['schedule', '賽程表'],
    ...(state.isAdmin ? [['control', '管理後台'], ['data', '資料管理']] : [['control', '主辦方登入']]),
  ];
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
      <div class="topbar-actions"><div class="system-state"><span></span> ${syncLabel}</div>${state.isAdmin ? '<button class="topbar-logout" data-action="logout-admin">登出</button>' : ''}</div>
    </header>
    <main>${content}</main>
    <footer>
      <span>SPIN LEAGUE © 2026</span>
      <div class="footer-links">
        <a class="footer-github" href="https://github.com/ckvs4517/Race_system" target="_blank" rel="noopener noreferrer" aria-label="在新分頁開啟 GitHub 專案">GitHub 專案 ↗</a>
        <span>CLOUD SYNC · ${icons.bolt} READY</span>
      </div>
    </footer>
  `;
}

export function pageHeader(kicker, title, description, action = '') {
  return `<div class="page-header"><div><p class="kicker">${kicker}</p><h1>${title}</h1><p class="page-description">${description}</p></div>${action}</div>`;
}

import { icons } from '../ui/icons.js';

const publicFeatureCards = [
  ['scoreboard', icons.bolt, 'QUICK MATCH', '獨立記分板', '練習或臨時對戰專用，快速開場、清楚記分。', '立即記分'],
  ['schedule', icons.bracket, 'LIVE BRACKET', '查看賽程', '掌握每一輪對戰、參賽者與晉級狀態。', '查看賽程'],
  ['control', icons.trophy, 'ORGANIZER', '主辦方後台', '由主辦方登入後建立賽事、更新比分與晉級結果。', '後台登入'],
];

export function homeView(tournamentCount, isAdmin = false) {
  const featureCards = isAdmin
    ? publicFeatureCards.map((item) => item[0] === 'control' ? ['manage', icons.trophy, 'NEW EVENT', '建立賽事', '輸入選手名單，自動建立單淘汰賽程。', '開始建立'] : item)
    : publicFeatureCards;
  return `
    <section class="hero section-wrap">
      <div class="hero-copy">
        <div class="status-label"><span></span> ARENA CONTROL ONLINE</div>
        <h1>LET IT<br><em>RIP.</em></h1>
        <p>從第一分到最終冠軍，讓賽事流程更快速、更清楚，也更有臨場感。</p>
        <div class="hero-actions">
          <button class="button button-primary" data-route="${isAdmin ? 'manage' : 'control'}">${isAdmin ? '建立新賽事' : '主辦方登入'} ${icons.arrow}</button>
          <button class="button button-secondary" data-route="scoreboard">開啟記分板</button>
        </div>
        <div class="hero-stats"><div><b>${String(tournamentCount).padStart(2, '0')}</b><span>已建立賽事</span></div><div><b>01</b><span>支援賽制</span></div><div><b>∞</b><span>對戰熱情</span></div></div>
      </div>
      <div class="arena-visual" aria-hidden="true">
        <div class="arena-grid"></div><div class="orbit orbit-a"></div><div class="orbit orbit-b"></div>
        <div class="spinner"><div class="spinner-core">S</div></div>
        <div class="visual-tag tag-top">BATTLE<br><b>READY</b></div><div class="visual-tag tag-bottom">NO. 01<br><b>SPIN SYSTEM</b></div>
      </div>
    </section>
    <section class="section-wrap tools-section">
      <div class="section-title"><div><p class="kicker">CONTROL CENTER</p><h2>選擇你的操作</h2></div><span>三個入口，一套完整流程</span></div>
      <div class="feature-grid">${featureCards.map(([route, icon, label, title, text, action], index) => `
        <button class="feature-card" data-route="${route}"><span class="card-number">0${index + 1}</span><span class="feature-icon">${icon}</span><span class="feature-label">${label}</span><strong>${title}</strong><p>${text}</p><span class="card-action">${action} ${icons.arrow}</span></button>
      `).join('')}</div>
    </section>`;
}

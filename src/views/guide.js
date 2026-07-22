/** 第一次使用者的公開操作說明；不需登入即可閱讀。 */
import { icons } from '../ui/icons.js';
import { pageHeader } from '../ui/shell.js';

const steps = [
  ['01', '登入主辦方後台', '由主辦方輸入 PIN。觀眾查看賽程與使用獨立記分板不需要登入。'],
  ['02', '建立並確認賽事', '輸入賽事名稱、賽制、1～8 台戰鬥台與 2～32 位選手；開始前仍可編輯或重新分組。'],
  ['03', '處理種子並開始', '奇數人的單淘汰賽需先抽一位首輪種子。確認名單後按下「賽事開始」，設定便會鎖定。'],
  ['04', '點擊節點輸入比分', '點擊綠色「可開始」對戰，使用加減分後確認結果。一般勝方至少 4 分，棄賽則以 4：0 判定。'],
  ['05', '查看排名與保存結果', '完成每場比賽後系統會自動晉級、配對及更新排行榜；資料會同步保存到雲端。'],
];

export function guideView(isAdmin = false) {
  return `<section class="section-wrap page-section guide-page">
    ${pageHeader('GETTING STARTED', '第一次使用？五步完成一場賽事', '操作會依賽事狀態逐步開放；先確認名單，再開始比賽，就不容易漏掉重要設定。', `<div class="header-actions"><button class="button button-primary" data-route="${isAdmin ? 'manage' : 'control'}">${isAdmin ? '建立賽事' : '主辦方登入'} ${icons.arrow}</button><button class="button button-secondary" data-route="schedule">查看公開賽程</button></div>`)}
    <div class="guide-steps">${steps.map(([number, title, text]) => `<article class="guide-step"><span>${number}</span><div><h2>${title}</h2><p>${text}</p></div></article>`).join('')}</div>
    <div class="guide-notes">
      <article><p class="kicker">BEFORE START</p><h2>開始前可以調整</h2><ul><li>修改賽事名稱、賽制、戰鬥台數與選手名單</li><li>重新隨機分組或重新抽選首輪種子</li><li>確認未到場選手沒有留在名單中</li></ul></article>
      <article><p class="kicker">DURING EVENT</p><h2>開始後需要注意</h2><ul><li>設定與名單會鎖定，避免中途改動賽程</li><li>未出席或中途退賽成立後不可恢復</li><li>重新比賽會清除受影響的後續輪次</li></ul></article>
    </div>
    <div class="guide-quick"><div><p class="kicker">QUICK MATCH</p><h2>只想臨時計分？</h2><p>獨立記分板不會連動正式賽事，適合練習或臨時對戰。</p></div><button class="button button-secondary" data-route="scoreboard">開啟獨立記分板</button></div>
  </section>`;
}

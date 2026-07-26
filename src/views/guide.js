/** 第一次使用者的公開操作說明；不需登入即可閱讀。 */
import { icons } from '../ui/icons.js';
import { pageHeader } from '../ui/shell.js';

const steps = [
  ['01', '建立賽事', '登入主辦方後台，填寫賽事資訊、選擇賽制與戰鬥台數。名單可以先留空；單淘汰支援 2～32 位，瑞士制支援 4～32 位。'],
  ['02', '開放公開報名', '進入剛建立的賽事，按「建立公開報名連結」，設定名額後即可複製或用手機分享。截止時間可以不填；賽事開始時仍會自動停止收件。'],
  ['03', '整理參賽名單', '核准線上報名，或按「新增選手」加入現場選手。需要刪除時先按「管理名單」，勾選後再一次確認，避免手機誤觸。'],
  ['04', '完成選手報到', '在名單直接勾選已到場選手。「全部／未報到／已報到」會先篩選狀態，搜尋文字再從目前結果中過濾名稱；報到階段不會提前排賽程。'],
  ['05', '產生、調整並確認賽程', '確認報到後進入排程階段，先按「隨機分組」。現場若有特殊狀況，可逐場更換誰對誰；確認賽程後才正式開放裁判記分。'],
  ['06', '記分、完賽與備份', '點擊「可開始」的節點輸入比分。賽程區只保留目前輪次，已完成對戰可在排行榜點選選手展開查看；瑞士制固定四輪，再確認四強或加賽，最後進行前四循環決賽。'],
];

export function guideView(isAdmin = false) {
  return `<section class="section-wrap page-section guide-page">
    ${pageHeader('GETTING STARTED', '第一次使用？六步完成一場賽事', '每場賽事都會顯示目前進度與下一個主要操作；照順序完成，就能快速從報名一路進行到完賽。', `<div class="header-actions"><button class="button button-primary" data-route="${isAdmin ? 'manage' : 'control'}">${isAdmin ? '建立賽事' : '主辦方登入'} ${icons.arrow}</button><button class="button button-secondary" data-route="schedule">查看公開賽程</button></div>`)}
    <div class="guide-steps">${steps.map(([number, title, text]) => `<article class="guide-step"><span>${number}</span><div><h2>${title}</h2><p>${text}</p></div></article>`).join('')}</div>
    <div class="guide-notes">
      <article><p class="kicker">BEFORE START</p><h2>開始前一定要確認</h2><ul><li>公開報名連結只提供收件，核准後才會進入正式名單；關閉報名或進入排程時舊網址會撤銷</li><li>從賽事內查看報名名單時，「返回」會回到原賽事；上方報名管理則可選擇其他賽事</li><li>檢查賽制、戰鬥台與報到人數；未報到者不會排入賽程</li><li>名單移除一定要進入管理模式並再次確認</li></ul></article>
      <article><p class="kicker">DURING EVENT</p><h2>比賽中操作原則</h2><ul><li>裁判各自只開自己戰鬥台的待打節點</li><li>畫面出現「已儲存」後再前往下一場；其他裁判的結果會自動同步</li><li>未出席或中途退賽成立後不可恢復；重打會清除受影響的後續輪次</li></ul></article>
    </div>
    <div class="guide-quick"><div><p class="kicker">QUICK MATCH</p><h2>只想臨時計分？</h2><p>獨立記分板不會連動正式賽事，適合練習或臨時對戰。</p></div><button class="button button-secondary" data-route="scoreboard">開啟獨立記分板</button></div>
  </section>`;
}

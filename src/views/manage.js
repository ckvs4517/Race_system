import { pageHeader } from '../ui/shell.js';
import { icons } from '../ui/icons.js';
import { createTournament } from '../domain/tournament.js';

export function manageView() {
  return `<section class="section-wrap page-section">
    ${pageHeader('TOURNAMENT SETUP', '建立新賽事', '設定賽事名稱與參賽者，系統會自動補上輪空並產生單淘汰賽程。')}
    <form class="setup-layout" data-tournament-form>
      <div class="form-panel">
        <div class="step-heading"><span>01</span><div><b>基本資料</b><small>替這場賽事設定名稱</small></div></div>
        <label class="field"><span>賽事名稱</span><input name="name" maxlength="40" placeholder="例如：夏季陀螺公開賽" required></label>
        <div class="step-heading"><span>02</span><div><b>參賽者名單</b><small>一行輸入一位，支援 2–16 位</small></div></div>
        <label class="field"><span>選手名稱</span><textarea name="players" placeholder="小明&#10;阿龍&#10;Spin Master&#10;烈焰之翼" required></textarea></label>
        <div class="form-footer"><span data-player-count>目前 0 位參賽者</span><button class="button button-primary" type="submit">產生賽程 ${icons.arrow}</button></div>
      </div>
      <aside class="setup-aside"><div class="aside-icon">${icons.trophy}</div><p class="kicker">FORMAT</p><h2>單淘汰賽</h2><p>輸掉一場即淘汰，勝者持續晉級，直到產生最終冠軍。</p><ul><li><i></i>自動處理輪空</li><li><i></i>2 至 16 位選手</li><li><i></i>自動產生對戰輪次</li></ul></aside>
    </form>
  </section>`;
}

export function bindManage(root, onCreate) {
  const form = root.querySelector('[data-tournament-form]');
  const players = form.elements.players;
  const count = root.querySelector('[data-player-count]');
  const getPlayers = () => players.value.split('\n').map((value) => value.trim()).filter(Boolean);
  players.addEventListener('input', () => { count.textContent = `目前 ${getPlayers().length} 位參賽者`; });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const playerList = getPlayers();
    if (playerList.length < 2 || playerList.length > 16) return alert('參賽者人數需要介於 2 至 16 位。');
    onCreate(createTournament(form.elements.name.value, playerList));
  });
}

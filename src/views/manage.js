import { pageHeader } from '../ui/shell.js';
import { icons } from '../ui/icons.js';
import { createTournament, updateDraftTournament } from '../domain/tournament.js';

export function manageView(tournament = null) {
  const isEditing = Boolean(tournament);
  const title = isEditing ? '編輯賽事' : '建立新賽事';
  const description = isEditing
    ? '賽事開始前可以修改名稱與參賽者；儲存後會重新產生預覽賽程。'
    : '先建立準備中的賽事，確認參賽名單後再正式開始。';
  const backButton = isEditing ? '<button class="button button-secondary" data-action="cancel-edit">← 返回賽程</button>' : '';
  const playerText = tournament?.players?.join('\n') || '';

  return `<section class="section-wrap page-section">
    ${pageHeader(isEditing ? 'EDIT TOURNAMENT' : 'TOURNAMENT SETUP', title, description, backButton)}
    <form class="setup-layout" data-tournament-form>
      <div class="form-panel">
        <div class="draft-notice"><i></i><div><b>準備中賽事</b><span>按下「賽事開始」前，名稱與參賽名單都可以修改。</span></div></div>
        <div class="step-heading"><span>01</span><div><b>基本資料</b><small>替這場賽事設定名稱</small></div></div>
        <label class="field"><span>賽事名稱</span><input name="name" maxlength="40" value="${escapeAttribute(tournament?.name || '')}" placeholder="例如：夏季陀螺公開賽" required></label>
        <div class="step-heading"><span>02</span><div><b>參賽者名單</b><small>一行輸入一位，支援 2–32 位</small></div></div>
        <label class="field"><span>選手名稱</span><textarea name="players" placeholder="小明&#10;阿龍&#10;Spin Master&#10;烈焰之翼" required>${escapeText(playerText)}</textarea></label>
        <div class="form-footer"><span data-player-count>目前 ${tournament?.players?.length || 0} 位參賽者</span><button class="button button-primary" type="submit">${isEditing ? '儲存變更' : '建立預覽賽程'} ${icons.arrow}</button></div>
      </div>
      <aside class="setup-aside"><div class="aside-icon">${icons.trophy}</div><p class="kicker">FORMAT</p><h2>單淘汰賽</h2><p>輸掉一場即淘汰，勝者持續晉級，直到產生最終冠軍。</p><ul><li><i></i>自動處理輪空</li><li><i></i>2 至 32 位選手</li><li><i></i>開始前可編輯名單</li><li><i></i>開始後鎖定賽程</li></ul></aside>
    </form>
  </section>`;
}

export function bindManage(root, options) {
  const form = root.querySelector('[data-tournament-form]');
  const players = form.elements.players;
  const count = root.querySelector('[data-player-count]');
  const getPlayers = () => players.value.split('\n').map((value) => value.trim()).filter(Boolean);
  players.addEventListener('input', () => { count.textContent = `目前 ${getPlayers().length} 位參賽者`; });
  root.querySelector('[data-action="cancel-edit"]')?.addEventListener('click', () => options.onCancel?.());
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const playerList = getPlayers();
    if (playerList.length < 2 || playerList.length > 32) return alert('參賽者人數需要介於 2 至 32 位。');
    try {
      const result = options.tournament
        ? updateDraftTournament(options.tournament, form.elements.name.value, playerList)
        : createTournament(form.elements.name.value, playerList);
      options.onSubmit(result);
    } catch (error) {
      alert(error.message);
    }
  });
}

function escapeAttribute(value) {
  return escapeText(value).replaceAll('"', '&quot;');
}

function escapeText(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

/** 建立／編輯準備中賽事的表單；送出前驗證名單與戰鬥台數。 */
import { pageHeader } from '../ui/shell.js';
import { icons } from '../ui/icons.js';
import { createTournament, updateDraftTournament } from '../domain/tournament.js';
import { listTournamentFormats } from '../formats/registry.js';

export function manageView(tournament = null) {
  const isEditing = Boolean(tournament);
  const title = isEditing ? '編輯賽事' : '建立新賽事';
  const description = isEditing
    ? '賽事開始前可以修改名稱、賽制、戰鬥台數與參賽者；儲存後會重新產生預覽賽程。'
    : '先建立準備中的賽事，確認參賽名單後再正式開始。';
  const backButton = isEditing ? '<button class="button button-secondary" data-action="cancel-edit">← 返回賽程</button>' : '';
  const playerText = tournament?.players?.join('\n') || '';
  const selectedFormat = tournament?.format || 'single_elimination';
  const formatOptions = listTournamentFormats().map((format) => `<option value="${format.id}" ${format.id === selectedFormat ? 'selected' : ''}>${format.name}</option>`).join('');

  return `<section class="section-wrap page-section">
    ${pageHeader(isEditing ? 'EDIT TOURNAMENT' : 'TOURNAMENT SETUP', title, description, backButton)}
    <form class="setup-layout" data-tournament-form>
      <div class="form-panel">
        <div class="draft-notice"><i></i><div><b>準備中賽事</b><span>建立後會自動隨機分組；正式開始前仍可重新抽選。</span></div></div>
        <div class="step-heading"><span>01</span><div><b>基本資料</b><small>替這場賽事設定名稱</small></div></div>
        <label class="field"><span>賽事名稱</span><input name="name" maxlength="40" value="${escapeAttribute(tournament?.name || '')}" placeholder="例如：夏季陀螺公開賽" required></label>
        <label class="field"><span>比賽賽制</span><select name="format">${formatOptions}</select></label>
        <label class="field"><span>戰鬥台數</span><input name="arenaCount" type="number" inputmode="numeric" min="1" max="8" step="1" value="${tournament?.arenaCount || 1}" required><small>可設定 1 至 8 台；賽程會平均分配到各戰鬥台。</small></label>
        <div class="step-heading"><span>02</span><div><b>參賽者名單</b><small>一行輸入一位，支援 2–32 位</small></div></div>
        <label class="field"><span>選手名稱</span><textarea name="players" placeholder="小明&#10;阿龍&#10;Spin Master&#10;烈焰之翼" required>${escapeText(playerText)}</textarea></label>
        <div class="form-footer"><span data-player-count>目前 ${tournament?.players?.length || 0} 位參賽者</span><button class="button button-primary" type="submit">${isEditing ? '儲存變更' : '建立預覽賽程'} ${icons.arrow}</button></div>
      </div>
      <aside class="setup-aside"><div class="aside-icon">${icons.trophy}</div><p class="kicker">FORMAT</p><h2>兩種賽制</h2><p><b>單淘汰賽</b>：輸掉一場即淘汰，勝者持續晉級。</p><p><b>瑞士制</b>：每輪依目前排名配對，盡量避免重複對手，完成指定輪數後依戰績排名。</p><ul><li><i></i>支援 2 至 32 位選手</li><li><i></i>支援 1 至 8 台戰鬥台</li><li><i></i>每輪對戰平均分配到各台</li><li><i></i>瑞士制自動安排後續對戰</li><li><i></i>開始後鎖定全部設定</li></ul></aside>
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
        ? updateDraftTournament(options.tournament, form.elements.name.value, playerList, form.elements.format.value, form.elements.arenaCount.value)
        : createTournament(form.elements.name.value, playerList, form.elements.format.value, form.elements.arenaCount.value);
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

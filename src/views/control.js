import { pageHeader } from '../ui/shell.js';

export function controlView(isAdmin, error = '') {
  if (isAdmin) {
    return `<section class="section-wrap page-section">
      ${pageHeader('CONTROL MODE', '管理後台', '你已通過主辦方 PIN 驗證，可以建立賽事與更新正式比分。')}
      <div class="control-panel is-authenticated">
        <span class="control-status"><i></i> 後台權限已啟用</span>
        <h2>賽事控制中心</h2>
        <p>所有修改會儲存至雲端，公開頁面重新整理後即可看到最新賽程。</p>
        <div class="control-actions"><button class="button button-primary" data-route="manage">建立新賽事</button><button class="button button-secondary" data-route="schedule">管理現有賽事</button><button class="button button-secondary" data-route="data">資料管理</button><button class="button button-secondary" data-action="logout-admin">登出後台</button></div>
      </div>
    </section>`;
  }

  return `<section class="section-wrap page-section control-page">
    ${pageHeader('ORGANIZER ACCESS', '主辦方後台', '輸入主辦方 PIN 後，才可建立賽事、記分、重賽或刪除資料。')}
    <form class="control-panel" data-control-login>
      <span class="control-lock">PIN</span>
      <h2>進入控制模式</h2>
      <p>公開觀眾不需要登入；這裡只供主辦方與裁判操作。</p>
      ${error ? `<div class="control-error">${escapeText(error)}</div>` : ''}
      <label class="field"><span>主辦方 PIN</span><input name="pin" type="password" inputmode="numeric" autocomplete="current-password" minlength="4" maxlength="32" required autofocus></label>
      <button class="button button-primary" type="submit">驗證並進入後台</button>
    </form>
  </section>`;
}

export function bindControl(root, { onLogin, onLogout }) {
  root.querySelector('[data-control-login]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button[type="submit"]');
    button.disabled = true;
    button.textContent = '驗證中…';
    await onLogin(event.currentTarget.elements.pin.value);
  });
  root.querySelector('[data-action="logout-admin"]')?.addEventListener('click', onLogout);
}

function escapeText(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

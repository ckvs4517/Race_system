/** 主辦方登入／登出 controller；畫面本身仍由 views/control.js 負責。 */
import { navigate } from '../../core/router.js';
import { loginAdmin, logoutAdmin } from '../../data/store.js';
import { bindControl } from '../../views/control.js';

export function bindControlController(root) {
  bindControl(root, {
    onLogin: async (pin) => {
      try {
        await loginAdmin(pin);
        navigate('control');
      } catch (error) {
        root.querySelector('.control-error')?.remove();
        const form = root.querySelector('[data-control-login]');
        form?.insertAdjacentHTML('afterbegin', `<div class="control-error">${escapeText(error.message)}</div>`);
        const button = form?.querySelector('button[type="submit"]');
        if (button) { button.disabled = false; button.textContent = '驗證並進入後台'; }
      }
    },
    onLogout: () => logoutAndGoHome(),
  });
}

export function logoutAndGoHome() {
  logoutAdmin();
  navigate('home');
}

function escapeText(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

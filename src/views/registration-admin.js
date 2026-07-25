/** 主辦方報名管理：開關公開報名、複製連結並審核待處理名單。 */
import { pageHeader } from '../ui/shell.js';

export function registrationAdminView(tournaments, selectedId, registrations = []) {
  const drafts = tournaments.filter((item) => item.status === '準備中');
  const selected = drafts.find((item) => item.id === selectedId) || null;
  const choices = drafts.map((item) => `<button class="registration-event-choice ${item.id === selectedId ? 'active' : ''}" data-registration-tournament="${item.id}"><b>${escapeText(item.name)}</b><span>${item.players.length} 位正式選手</span></button>`).join('');
  if (!selected) {
    return `<section class="section-wrap page-section">${pageHeader('REGISTRATION', '公開報名管理', '選擇一場準備中的賽事，開放報名並審核參賽名單。', '<button class="button button-primary" data-route="manage">＋ 建立賽事</button>')}<div class="registration-event-grid">${choices || '<div class="empty-state"><p>目前沒有準備中的賽事。</p></div>'}</div></section>`;
  }

  const settings = selected.registrationSettings || {};
  const link = `${location.origin}${location.pathname}#register/${selected.id}/${settings.token || ''}`;
  const rows = registrations.map((item) => `<article class="registration-row">
    <div><b>${escapeText(item.displayName)}</b><span>${escapeText(item.phone)}</span><small>${escapeText(item.notes || '沒有備註')}</small></div>
    <div class="registration-status status-${escapeAttribute(item.status)}">${statusLabel(item.status)}</div>
    <div class="registration-actions">
      ${item.status !== 'approved' ? `<button class="button button-primary" data-registration-action="approved" data-registration-id="${escapeAttribute(item.id)}">核准加入名單</button>` : ''}
      ${item.status !== 'waitlist' ? `<button class="button button-secondary" data-registration-action="waitlist" data-registration-id="${escapeAttribute(item.id)}">候補</button>` : ''}
      ${item.status !== 'rejected' ? `<button class="button button-secondary" data-registration-action="rejected" data-registration-id="${escapeAttribute(item.id)}">拒絕</button>` : ''}
    </div>
  </article>`).join('');

  return `<section class="section-wrap page-section">
    ${pageHeader('REGISTRATION', '公開報名管理', selected.name, '<button class="button button-secondary" data-registration-back>← 選擇其他賽事</button>')}
    <div class="registration-admin-layout">
      <form class="form-panel registration-settings" data-registration-settings>
        <h2>報名設定</h2>
        <label class="registration-checkbox"><input name="enabled" type="checkbox" ${settings.enabled ? 'checked' : ''}><span>開放公開報名</span></label>
        <div class="field-grid">
          <label class="field"><span>人數上限</span><input name="capacity" type="number" min="2" max="32" value="${Number(settings.capacity) || 32}" required></label>
          <label class="field"><span>報名截止</span><input name="deadline" type="datetime-local" value="${escapeAttribute(formatDateTimeInput(settings.deadline))}"></label>
        </div>
        <button class="button button-primary" type="submit">儲存報名設定</button>
        ${settings.enabled ? `<div class="registration-link"><span>公開報名連結</span><input value="${escapeAttribute(link)}" readonly><button class="button button-secondary" type="button" data-copy-registration-link="${escapeAttribute(link)}">複製連結</button></div>` : '<p class="page-description">開啟並儲存後，這裡會提供公開報名連結。</p>'}
      </form>
      <div class="registration-list-panel">
        <div class="registration-list-heading"><div><p class="kicker">APPLICATIONS</p><h2>報名名單</h2></div><b>${registrations.length} 筆</b></div>
        ${rows || '<div class="empty-state"><p>目前還沒有收到報名。</p></div>'}
      </div>
    </div>
  </section>`;
}

export function bindRegistrationAdmin(root, actions) {
  root.querySelectorAll('[data-registration-tournament]').forEach((button) => button.addEventListener('click', () => actions.onSelect(Number(button.dataset.registrationTournament))));
  root.querySelector('[data-registration-back]')?.addEventListener('click', () => actions.onBack());
  root.querySelector('[data-registration-settings]')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    actions.onSaveSettings({
      enabled: form.elements.enabled.checked,
      capacity: Number(form.elements.capacity.value),
      deadline: form.elements.deadline.value ? new Date(form.elements.deadline.value).toISOString() : '',
    });
  });
  root.querySelector('[data-copy-registration-link]')?.addEventListener('click', async (event) => {
    await navigator.clipboard.writeText(event.currentTarget.dataset.copyRegistrationLink);
    event.currentTarget.textContent = '已複製';
  });
  root.querySelectorAll('[data-registration-action]').forEach((button) => button.addEventListener('click', () => actions.onStatus(button.dataset.registrationId, button.dataset.registrationAction)));
}

function statusLabel(status) {
  return { pending: '待審核', approved: '已核准', waitlist: '候補', rejected: '已拒絕' }[status] || status;
}

function formatDateTimeInput(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 16);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function escapeAttribute(value) {
  return escapeText(value).replaceAll('"', '&quot;');
}

function escapeText(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

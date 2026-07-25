/** 公開報名表單；只顯示公開賽事資訊，不暴露既有報名者個資。 */
import { pageHeader } from '../ui/shell.js';

export function registrationView(model = {}) {
  if (model.loading) return page('正在載入報名表單…', '<div class="empty-state"><p>請稍候</p></div>');
  if (model.error) return page('無法開啟報名表單', `<div class="empty-state"><p>${escapeText(model.error)}</p><button class="button button-secondary" data-route="schedule">查看公開賽程</button></div>`);
  if (model.success) return page('報名已送出', `<div class="registration-success"><h2>收到你的報名資料</h2><p>目前狀態為「等待主辦方核准」。正式名單以主辦方後台確認結果為準。</p><button class="button button-secondary" data-route="schedule">查看公開賽程</button></div>`);
  const tournament = model.data?.tournament;
  if (!tournament) return page('公開報名', '<div class="empty-state"><p>找不到報名資料。</p></div>');
  const remaining = Math.max(0, Number(tournament.capacity) - Number(model.data.registrationCount || 0));
  const customFields = (tournament.fields || []).map(customFieldView).join('');
  return `<section class="section-wrap page-section registration-page">
    ${pageHeader('PUBLIC REGISTRATION', tournament.name, '填寫後會送到主辦方後台審核；核准後才會加入正式參賽名單。')}
    <div class="registration-summary">
      <div><span>目前報名</span><b>${Number(model.data.registrationCount || 0)} / ${Number(tournament.capacity)}</b></div>
      <div><span>剩餘名額</span><b>${remaining}</b></div>
      <div><span>報名截止</span><b>${tournament.deadline ? escapeText(formatDateTime(tournament.deadline)) : '主辦方關閉前'}</b></div>
    </div>
    <form class="form-panel registration-form" data-public-registration>
      <label class="field"><span>選手名稱／暱稱</span><input name="displayName" maxlength="60" autocomplete="name" required></label>
      <label class="field"><span>聯絡電話</span><input name="phone" type="tel" maxlength="40" autocomplete="tel" required><small>只供主辦方聯絡，不會顯示在公開賽程。</small></label>
      <label class="field"><span>備註</span><textarea name="notes" maxlength="500" placeholder="選填"></textarea></label>
      ${customFields}
      <label class="registration-honeypot" aria-hidden="true"><span>網站</span><input name="website" tabindex="-1" autocomplete="off"></label>
      <p class="registration-privacy">送出即表示同意主辦方為本次賽事聯絡與名單管理使用上述資料。</p>
      <div class="control-error" data-registration-error hidden></div>
      <button class="button button-primary" type="submit">送出報名</button>
    </form>
  </section>`;
}

export function bindPublicRegistration(root, onSubmit) {
  const form = root.querySelector('[data-public-registration]');
  if (!form) return;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    const error = form.querySelector('[data-registration-error]');
    button.disabled = true;
    button.textContent = '送出中…';
    error.hidden = true;
    const answers = {};
    form.querySelectorAll('[data-custom-field]').forEach((input) => {
      answers[input.dataset.customField] = input.type === 'checkbox' ? input.checked : input.value;
    });
    try {
      await onSubmit({
        displayName: form.elements.displayName.value,
        phone: form.elements.phone.value,
        notes: form.elements.notes.value,
        website: form.elements.website.value,
        answers,
      });
    } catch (submitError) {
      error.textContent = submitError.message;
      error.hidden = false;
      button.disabled = false;
      button.textContent = '送出報名';
    }
  });
}

function customFieldView(field) {
  const required = field.required ? 'required' : '';
  if (field.type === 'checkbox') {
    return `<label class="registration-checkbox"><input type="checkbox" data-custom-field="${escapeAttribute(field.id)}" ${required}><span>${escapeText(field.label)}</span></label>`;
  }
  if (field.type === 'textarea') {
    return `<label class="field"><span>${escapeText(field.label)}</span><textarea maxlength="1000" data-custom-field="${escapeAttribute(field.id)}" ${required}></textarea></label>`;
  }
  return `<label class="field"><span>${escapeText(field.label)}</span><input maxlength="200" data-custom-field="${escapeAttribute(field.id)}" ${required}></label>`;
}

function page(title, content) {
  return `<section class="section-wrap page-section">${pageHeader('PUBLIC REGISTRATION', title, 'Spin League 賽事報名')}${content}</section>`;
}

function formatDateTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-TW', { dateStyle: 'medium', timeStyle: 'short' });
}

function escapeAttribute(value) {
  return escapeText(value).replaceAll('"', '&quot;');
}

function escapeText(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

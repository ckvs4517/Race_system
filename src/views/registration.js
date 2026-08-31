/** 私密參賽資料填寫頁：送出後直接加入正式名單。 */
import { pageHeader } from '../ui/shell.js';

export function registrationView(model = {}) {
  if (model.loading) return page('正在讀取參賽資料填寫頁', '<div class="empty-state"><p>請稍候…</p></div>');
  if (model.error) return page('無法開啟參賽資料填寫頁', `<div class="empty-state"><p>${escapeText(model.error)}</p></div>`);
  if (model.success) {
    const name = escapeText(model.result?.participant?.displayName || '');
    return page('資料已送出', `<div class="registration-success"><h2>已加入正式參賽名單</h2><p>${name}</p><p>資料如需更改，請聯絡主辦人。</p></div>`);
  }
  const tournament = model.data?.tournament;
  if (!tournament) return page('參賽資料填寫', '<div class="empty-state"><p>找不到這場賽事。</p></div>');
  const remaining = Math.max(0, Number(tournament.capacity) - Number(model.data.registrationCount || 0));
  const customFields = (tournament.fields || []).map(customFieldView).join('');
  return `<section class="section-wrap page-section registration-page">
    ${pageHeader('PARTICIPANT INFORMATION', tournament.name, '這是主辦人提供的私密連結。送出後會直接加入正式參賽名單。')}
    <div class="registration-summary">
      <div><span>目前名單</span><b>${Number(model.data.registrationCount || 0)} / ${Number(tournament.capacity)}</b></div>
      <div><span>剩餘名額</span><b>${remaining}</b></div>
      <div><span>填寫期限</span><b>${tournament.deadline ? escapeText(formatDateTime(tournament.deadline)) : '賽事開始前'}</b></div>
    </div>
    <form class="form-panel registration-form" data-public-registration>
      <label class="field"><span>選手名稱（必填）</span><input name="displayName" maxlength="60" autocomplete="name" required></label>
      <label class="field"><span>聯絡電話（必填）</span><input name="phone" type="tel" maxlength="40" autocomplete="tel" required><small>僅供主辦人聯絡與避免重複填寫，不會公開顯示。</small></label>
      <label class="field"><span>備註</span><textarea name="notes" maxlength="500" placeholder="選填"></textarea></label>
      ${customFields}
      <label class="registration-honeypot" aria-hidden="true"><span>網站</span><input name="website" tabindex="-1" autocomplete="off"></label>
      <p class="registration-privacy">送出前請再次確認名稱、電話與備註。送出後資料會直接進入正式名單。</p>
      <div class="registration-confirmation" data-registration-confirmation></div>
      <div class="control-error" data-registration-error hidden></div>
      <button class="button button-primary" type="submit">確認並送出參賽資料</button>
    </form>
  </section>`;
}

export function bindPublicRegistration(root, onSubmit) {
  const form = root.querySelector('[data-public-registration]');
  if (!form) return;
  const updateConfirmation = () => {
    const name = form.elements.displayName.value.trim() || '尚未輸入名稱';
    const notes = form.elements.notes.value.trim();
    form.querySelector('[data-registration-confirmation]').textContent = `送出內容：${name}${notes ? ` · 備註：${notes}` : ''}`;
  };
  form.addEventListener('input', updateConfirmation);
  form.addEventListener('change', updateConfirmation);
  updateConfirmation();
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    const error = form.querySelector('[data-registration-error]');
    const answers = {};
    form.querySelectorAll('[data-custom-field]').forEach((input) => {
      answers[input.dataset.customField] = input.type === 'checkbox' ? input.checked : input.value;
    });
    try {
      if (!window.confirm(`確認送出「${form.elements.displayName.value.trim()}」？\n送出後將直接加入正式名單。`)) return;
      button.disabled = true;
      button.textContent = '送出中…';
      error.hidden = true;
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
      button.textContent = '確認並送出參賽資料';
    }
  });
}

function customFieldView(field) {
  const required = field.required ? 'required' : '';
  if (field.type === 'checkbox') return `<label class="registration-checkbox"><input type="checkbox" data-custom-field="${escapeAttribute(field.id)}" ${required}><span>${escapeText(field.label)}</span></label>`;
  if (field.type === 'textarea') return `<label class="field"><span>${escapeText(field.label)}</span><textarea maxlength="1000" data-custom-field="${escapeAttribute(field.id)}" ${required}></textarea></label>`;
  return `<label class="field"><span>${escapeText(field.label)}</span><input maxlength="200" data-custom-field="${escapeAttribute(field.id)}" ${required}></label>`;
}

function page(title, content) {
  return `<section class="section-wrap page-section">${pageHeader('PARTICIPANT INFORMATION', title, 'Spin League 私密參賽資料')}${content}</section>`;
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

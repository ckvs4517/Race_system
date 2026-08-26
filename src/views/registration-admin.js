/** 主辦方參賽資料填寫管理：私密連結、正式名單與飲品統計。 */
import { createDrinkSummary } from '../domain/drinks.js';
import { MAX_TOURNAMENT_PLAYERS } from '../domain/tournament.js';
import { pageHeader } from '../ui/shell.js';

export function registrationAdminView(tournaments, selectedId, legacyRegistrations = [], returnToTournament = false) {
  const drafts = tournaments.filter((item) => item.status === '準備中');
  const selected = drafts.find((item) => item.id === selectedId) || null;
  const choices = drafts.map((item) => `<button class="registration-event-choice ${item.id === selectedId ? 'active' : ''}" data-registration-tournament="${item.id}"><b>${escapeText(item.name)}</b><span>${item.players.length} 位正式選手</span></button>`).join('');
  if (!selected) {
    return `<section class="section-wrap page-section">${pageHeader('PARTICIPANT INFORMATION', '參賽資料填寫管理', '選擇一場準備中的賽事，建立私密填寫連結。', '<button class="button button-primary" data-route="manage">＋ 建立賽事</button>')}<div class="registration-event-grid">${choices || '<div class="empty-state"><p>目前沒有準備中的賽事。</p></div>'}</div></section>`;
  }

  const settings = selected.registrationSettings || {};
  const link = `${location.origin}${location.pathname}#register/${selected.id}/${settings.token || ''}`;
  const summary = createDrinkSummary(selected);
  const participantRows = selected.players.map((player) => {
    const details = selected.participantDetails?.[player] || {};
    return `<article class="registration-row"><div><b>${escapeText(player)}</b><span>${escapeText(details.phone || '未填電話')}</span><small>${escapeText(details.drink?.displayName || '尚未選擇飲品')}</small></div></article>`;
  }).join('');

  return `<section class="section-wrap page-section">
    ${pageHeader('PARTICIPANT INFORMATION', '參賽資料填寫管理', selected.name, `<button class="button button-secondary" data-registration-back>${returnToTournament ? '← 返回賽事後台' : '← 選擇其他賽事'}</button>`)}
    <div class="registration-admin-layout">
      <form class="form-panel registration-settings" data-registration-settings>
        <h2>私密填寫連結設定</h2>
        <label class="registration-checkbox"><input name="enabled" type="checkbox" ${settings.enabled ? 'checked' : ''}><span>啟用參賽資料填寫連結</span></label>
        <p class="page-description">只有取得連結的人可填寫。送出後會直接加入正式名單，不需再次核准；停用連結或開始賽事後，原連結立即失效。</p>
        <div class="field-grid">
          <label class="field"><span>人數上限</span><input name="capacity" type="number" min="2" max="${MAX_TOURNAMENT_PLAYERS}" value="${Number(settings.capacity) || MAX_TOURNAMENT_PLAYERS}" required></label>
          <label class="field"><span>填寫截止（選填）</span><input name="deadline" type="datetime-local" value="${escapeAttribute(formatDateTimeInput(settings.deadline))}"></label>
        </div>
        <button class="button button-primary" type="submit">儲存設定</button>
        ${settings.enabled ? `<div class="registration-link"><span>私密參賽資料填寫連結</span><input value="${escapeAttribute(link)}" readonly><button class="button button-secondary" type="button" data-copy-registration-link="${escapeAttribute(link)}">複製連結</button></div>` : '<p class="page-description">啟用並儲存後，這裡會顯示可傳給已確認參賽者的連結。</p>'}
      </form>
      <div class="registration-list-panel">
        <div class="registration-list-heading"><div><p class="kicker">CONFIRMED ROSTER</p><h2>正式參賽名單</h2></div><b>${selected.players.length} 人</b></div>
        ${selected.drinkSettings?.enabled ? `<div class="drink-summary"><b>飲品統計</b><pre>${escapeText(summary.copyText)}</pre><button class="button button-secondary" data-copy-drink-summary="${escapeAttribute(summary.copyText)}">複製統計</button></div>` : ''}
        ${participantRows || '<div class="empty-state"><p>目前還沒有正式參賽者。</p></div>'}
        ${legacyRegistrations.length ? `<p class="legacy-registration-note">另有 ${legacyRegistrations.length} 筆舊版待審核資料保留於資料庫；新填寫資料不再進入待審核區。</p>` : ''}
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
  root.querySelector('[data-copy-registration-link]')?.addEventListener('click', async (event) => copyButton(event.currentTarget, event.currentTarget.dataset.copyRegistrationLink));
  root.querySelector('[data-copy-drink-summary]')?.addEventListener('click', async (event) => copyButton(event.currentTarget, event.currentTarget.dataset.copyDrinkSummary));
}

async function copyButton(button, value) {
  await navigator.clipboard.writeText(value);
  button.textContent = '已複製';
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

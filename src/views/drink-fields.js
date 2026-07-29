/** 共用單選飲品清單；公開表單與主辦方名單編輯使用同一套資料。 */

export function drinkSelectionFields(settings, current = null, { prefix = 'drink' } = {}) {
  if (!settings?.enabled) return '';
  const items = active(settings.items);
  if (!items.length) return '<p class="form-error">此賽事尚未設定可選飲品，請先由主辦方設定菜單。</p>';
  const selectedId = items.find((item) => item.id === current?.itemId || item.name === current?.displayName)?.id || items[0].id;
  return `<fieldset class="drink-fields" data-drink-fields>
    <legend>飲品選擇（必填）</legend>
    <div class="drink-option-list">${items.map((item) => `<label class="drink-choice"><input type="radio" name="${attr(prefix)}Item" value="${attr(item.id)}" ${item.id === selectedId ? 'checked' : ''} required><span>${text(item.name)}</span></label>`).join('')}</div>
  </fieldset>`;
}

export function bindDrinkSelectionFields() {}

export function readDrinkSelection(container) {
  if (!container) return undefined;
  const itemId = container.querySelector('input[type="radio"]:checked')?.value;
  if (!itemId) throw new Error('請選擇飲品。');
  return { itemId };
}

export function drinkSelectionLabel(container) {
  const option = container?.querySelector('input[type="radio"]:checked')?.parentElement?.textContent?.trim();
  return option ? `將選擇：${option}` : '';
}

function active(items) { return (items || []).filter((item) => item.active !== false).sort((left, right) => left.order - right.order); }
function text(value) { return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'); }
function attr(value) { return text(value).replaceAll('"', '&quot;'); }

/** 共用的飲品選擇器；公開表單與主辦方名單編輯使用同一套選項邏輯。 */

export function drinkSelectionFields(settings, current = null, { required = true, prefix = 'drink' } = {}) {
  if (!settings?.enabled) return '';
  const flavors = active(settings.coffeeFlavors);
  const caffeineFree = active(settings.caffeineFreeOptions);
  const hasExisting = Boolean(current?.displayName);
  const category = hasExisting ? 'existing' : (flavors.length ? 'coffee' : 'caffeine-free');
  const flavorOptions = flavors.map((item) => `<option value="${attr(item.id)}">${text(item.name)}</option>`).join('');
  const preparationOptions = flavors.flatMap((flavor) => active(flavor.preparations)
    .map((item) => `<option value="${attr(item.id)}" data-flavor="${attr(flavor.id)}">${text(item.name)}</option>`)).join('');
  const caffeineOptions = caffeineFree.map((item) => `<option value="${attr(item.id)}">${text(item.name)}</option>`).join('');
  return `<fieldset class="drink-fields" data-drink-fields data-required="${required ? 'true' : 'false'}">
    <legend>飲品選擇${required ? '（必填）' : '（選填）'}</legend>
    ${hasExisting ? `<label class="drink-choice"><input type="radio" name="${attr(prefix)}Category" value="existing" checked> 保留目前選擇：${text(current.displayName)}</label>` : ''}
    ${flavors.length ? `<label class="drink-choice"><input type="radio" name="${attr(prefix)}Category" value="coffee" ${category === 'coffee' ? 'checked' : ''}> 咖啡</label>
      <div class="drink-dependent" data-drink-coffee>
        <label class="field"><span>口味</span><select data-drink-flavor>${flavorOptions}</select></label>
        <label class="field"><span>作法</span><select data-drink-preparation>${preparationOptions}</select></label>
      </div>` : ''}
    ${caffeineFree.length ? `<label class="drink-choice"><input type="radio" name="${attr(prefix)}Category" value="caffeine-free" ${category === 'caffeine-free' ? 'checked' : ''}> 無咖啡因</label>
      <div class="drink-dependent" data-drink-caffeine-free>
        <label class="field"><span>品項</span><select data-drink-option>${caffeineOptions}</select></label>
      </div>` : ''}
    ${required ? '' : `<label class="drink-choice"><input type="radio" name="${attr(prefix)}Category" value="none"> 暫不選擇</label>`}
    <p class="drink-preview" data-drink-preview></p>
  </fieldset>`;
}

export function bindDrinkSelectionFields(root) {
  root.querySelectorAll('[data-drink-fields]').forEach((container) => {
    if (container.dataset.bound) return;
    container.dataset.bound = 'true';
    const update = () => {
      const category = container.querySelector('input[type="radio"]:checked')?.value || '';
      const coffee = container.querySelector('[data-drink-coffee]');
      const caffeineFree = container.querySelector('[data-drink-caffeine-free]');
      if (coffee) coffee.hidden = category !== 'coffee';
      if (caffeineFree) caffeineFree.hidden = category !== 'caffeine-free';
      const flavor = container.querySelector('[data-drink-flavor]');
      const preparation = container.querySelector('[data-drink-preparation]');
      if (category === 'coffee' && flavor && preparation) {
        [...preparation.options].forEach((option) => { option.hidden = option.dataset.flavor !== flavor.value; });
        if (preparation.selectedOptions[0]?.hidden) preparation.value = [...preparation.options].find((option) => !option.hidden)?.value || '';
      }
      const preview = container.querySelector('[data-drink-preview]');
      if (preview) preview.textContent = drinkSelectionLabel(container);
    };
    container.addEventListener('change', update);
    update();
  });
}

export function readDrinkSelection(container) {
  if (!container) return undefined;
  const category = container.querySelector('input[type="radio"]:checked')?.value;
  if (category === 'existing') return undefined;
  if (category === 'none') return null;
  if (category === 'coffee') {
    return {
      category,
      flavorId: container.querySelector('[data-drink-flavor]')?.value || '',
      preparationId: container.querySelector('[data-drink-preparation]')?.value || '',
    };
  }
  if (category === 'caffeine-free') {
    return { category, optionId: container.querySelector('[data-drink-option]')?.value || '' };
  }
  if (container.dataset.required === 'true') throw new Error('請選擇飲品。');
  return null;
}

export function drinkSelectionLabel(container) {
  const category = container.querySelector('input[type="radio"]:checked')?.value;
  if (category === 'existing') return container.querySelector('input[value="existing"]')?.parentElement?.textContent.trim() || '';
  if (category === 'coffee') {
    const flavor = container.querySelector('[data-drink-flavor]')?.selectedOptions[0]?.textContent;
    const preparation = container.querySelector('[data-drink-preparation]')?.selectedOptions[0]?.textContent;
    return flavor && preparation ? `將選擇：${flavor}咖啡／${preparation}` : '';
  }
  if (category === 'caffeine-free') {
    const option = container.querySelector('[data-drink-option]')?.selectedOptions[0]?.textContent;
    return option ? `將選擇：${option}` : '';
  }
  return '尚未選擇飲品';
}

function active(items) {
  return (items || []).filter((item) => item.active !== false).sort((left, right) => left.order - right.order);
}

function text(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function attr(value) {
  return text(value).replaceAll('"', '&quot;');
}

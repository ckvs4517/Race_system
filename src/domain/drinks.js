/** 每場賽事的單一飲品菜單、選擇驗證與採購統計。 */

const DEFAULT_NOTICE = '每位參賽者包含一杯飲品，請選擇一項後再送出。';
const DEFAULT_CHANGE_NOTICE = '飲品送出後無法自行修改，如需更改，請於比賽前一天私訊主辦人。';

export function createDefaultDrinkSettings() {
  return {
    enabled: true,
    notice: DEFAULT_NOTICE,
    changeNotice: DEFAULT_CHANGE_NOTICE,
    items: [
      option('coffee-blueberry-americano', '藍莓美式', 1),
      option('coffee-blueberry-latte', '藍莓拿鐵', 2),
      option('coffee-coconut-americano', '椰子美式', 3),
      option('coffee-coconut-latte', '椰子拿鐵', 4),
      option('coffee-coconut-cola', '椰子美式加汽水', 5),
      option('coffee-melon-americano', '哈密瓜美式', 6),
      option('coffee-melon-latte', '哈密瓜拿鐵', 7),
      option('soft-drink', '汽水 (無咖啡因)', 8),
      option('juice', '果汁(無咖啡因)', 9),
      option('green-juice-latte', '青汁拿鐵(無咖啡因)', 10),
    ],
  };
}

export function createEmptyDrinkSettings() {
  return { enabled: false, notice: '', changeNotice: '', items: [] };
}

export function normalizeDrinkSettings(value, fallback = createEmptyDrinkSettings()) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return structuredClone(fallback);
  const items = Array.isArray(value.items)
    ? normalizeItems(value.items, 50, (item, index) => ({
      id: cleanId(item.id, `drink-${index + 1}`), name: cleanText(item.name, 100),
      active: item.active !== false, order: normalizeOrder(item.order, index + 1),
    })).filter((item) => item.name)
    : legacyItems(value);
  return {
    enabled: Boolean(value.enabled),
    notice: cleanText(value.notice, 500),
    changeNotice: cleanText(value.changeNotice, 500),
    items: uniqueIds(items).sort(byOrder),
  };
}

export function resolveDrinkSelection(settingsValue, selection, { allowMissing = false } = {}) {
  const settings = normalizeDrinkSettings(settingsValue);
  if (!settings.enabled) return null;
  if (!selection || typeof selection !== 'object') {
    if (allowMissing) return null;
    throw new Error('請選擇飲品。');
  }
  const item = findDrinkItem(settings.items, selection);
  if (!item || !item.active) throw new Error('飲品選項無效或已停用。');
  return { category: 'item', itemId: item.id, displayName: item.name };
}

export function normalizeParticipantDetails(players = [], details = {}) {
  return Object.fromEntries(players.map((player) => {
    const source = details?.[player] && typeof details[player] === 'object' ? details[player] : {};
    return [player, {
      phone: cleanText(source.phone, 40), notes: cleanText(source.notes, 500),
      answers: normalizeAnswers(source.answers), drink: normalizeSavedDrink(source.drink),
    }];
  }));
}

export function normalizePhone(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('886')) digits = `0${digits.slice(3)}`;
  return digits;
}

export function createDrinkSummary(tournament) {
  const counts = new Map(); let missingCount = 0;
  for (const player of tournament.players || []) {
    const displayName = String(tournament.participantDetails?.[player]?.drink?.displayName || '').trim();
    if (!displayName) { missingCount += 1; continue; }
    counts.set(displayName, (counts.get(displayName) || 0) + 1);
  }
  const items = [...counts.entries()].map(([displayName, count]) => ({ displayName, count }));
  const selectedCount = items.reduce((total, item) => total + item.count, 0);
  const lines = items.map((item) => `${item.displayName}：${item.count} 杯`);
  if (missingCount) lines.push(`尚未選擇：${missingCount} 人`);
  lines.push(`總計：${selectedCount} 杯`);
  return { items, selectedCount, missingCount, copyText: lines.join('\n') };
}

function legacyItems(value) {
  const coffee = normalizeItems(value.coffeeFlavors, 20, (flavor, flavorIndex) =>
    normalizeItems(flavor.preparations, 20, (preparation, preparationIndex) => ({
      id: `legacy-coffee-${cleanId(flavor.id, String(flavorIndex + 1))}-${cleanId(preparation.id, String(preparationIndex + 1))}`,
      name: `${cleanText(flavor.name, 60)}咖啡／${cleanText(preparation.name, 60)}`,
      active: flavor.active !== false && preparation.active !== false,
      order: (flavorIndex + 1) * 100 + preparationIndex + 1,
    })).filter((item) => item.name !== '咖啡／'));
  const caffeineFree = normalizeItems(value.caffeineFreeOptions, 30, (item, index) => ({
    id: `legacy-option-${cleanId(item.id, String(index + 1))}`, name: cleanText(item.name, 100),
    active: item.active !== false, order: 3000 + index,
  })).filter((item) => item.name);
  return [...coffee.flat(), ...caffeineFree];
}

function findDrinkItem(items, selection) {
  if (selection.itemId) return items.find((item) => item.id === selection.itemId);
  if (selection.category === 'coffee') {
    const legacyId = `legacy-coffee-${cleanId(selection.flavorId, '')}-${cleanId(selection.preparationId, '')}`;
    const defaultId = `${cleanId(selection.flavorId, '')}-${cleanId(selection.preparationId, '')}`;
    return items.find((item) => item.id === legacyId || item.id === defaultId)
      || items.find((item) => item.name === String(selection.displayName || ''));
  }
  if (selection.category === 'caffeine-free') {
    return items.find((item) => item.id === `legacy-option-${cleanId(selection.optionId, '')}`)
      || items.find((item) => item.name === String(selection.displayName || ''));
  }
  return items.find((item) => item.name === String(selection.displayName || ''));
}

function normalizeSavedDrink(value) {
  if (!value || typeof value !== 'object' || !String(value.displayName || '').trim()) return null;
  return {
    category: value.category === 'item' ? 'item' : 'legacy',
    itemId: cleanId(value.itemId, ''), displayName: cleanText(value.displayName, 140),
  };
}

function normalizeAnswers(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).slice(0, 20).map(([key, answer]) => [
    cleanId(key, ''), typeof answer === 'boolean' ? answer : cleanText(answer, 1000),
  ]).filter(([key]) => key));
}
function normalizeItems(value, maximum, mapper) { return Array.isArray(value) ? value.filter((item) => item && typeof item === 'object' && !Array.isArray(item)).slice(0, maximum).map(mapper) : []; }
function uniqueIds(items) { const ids = new Set(); return items.filter((item) => item.id && !ids.has(item.id) && ids.add(item.id)); }
function cleanText(value, maximumLength) { return String(value || '').trim().slice(0, maximumLength); }
function cleanId(value, fallback) { return String(value || fallback || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 60); }
function normalizeOrder(value, fallback) { const order = Number(value); return Number.isFinite(order) ? order : fallback; }
function byOrder(left, right) { return left.order - right.order; }
function option(id, name, order) { return { id, name, active: true, order }; }

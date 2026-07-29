/** 每場賽事的飲品菜單、選擇驗證與完整品項統計。 */

const DEFAULT_NOTICE = '每位參賽者包含一杯飲品，請確認選擇後再送出。';
const DEFAULT_CHANGE_NOTICE = '飲品送出後無法自行修改，如需更改，請於比賽前一天私訊主辦人。';

export function createDefaultDrinkSettings() {
  return {
    enabled: true,
    notice: DEFAULT_NOTICE,
    changeNotice: DEFAULT_CHANGE_NOTICE,
    coffeeFlavors: [
      flavor('coffee-blueberry', '藍莓', 1, [preparation('no-milk', '美式', 1), preparation('milk', '拿鐵', 2)]),
      flavor('coffee-coconut', '椰子', 2, [preparation('no-milk', '美式', 1), preparation('milk', '拿鐵', 2), preparation('cola', '加可樂', 3)]),
      flavor('coffee-melon', '哈密瓜', 3, [preparation('no-milk', '美式', 1), preparation('milk', '拿鐵', 2)]),
    ],
    caffeineFreeOptions: [
      option('soft-drink', '汽水', 1),
      option('juice', '果汁', 2),
      option('green-juice-latte', '青汁拿鐵', 3),
    ],
  };
}

export function createEmptyDrinkSettings() {
  return {
    enabled: false,
    notice: '',
    changeNotice: '',
    coffeeFlavors: [],
    caffeineFreeOptions: [],
  };
}

export function normalizeDrinkSettings(value, fallback = createEmptyDrinkSettings()) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return structuredClone(fallback);
  const coffeeFlavors = normalizeItems(value.coffeeFlavors, 20, (item, index) => ({
    id: cleanId(item.id, `coffee-${index + 1}`),
    name: cleanText(item.name, 60),
    active: item.active !== false,
    order: normalizeOrder(item.order, index + 1),
    preparations: normalizeItems(item.preparations, 20, (preparationItem, preparationIndex) => ({
      id: cleanId(preparationItem.id, `preparation-${preparationIndex + 1}`),
      name: cleanText(preparationItem.name, 60),
      active: preparationItem.active !== false,
      order: normalizeOrder(preparationItem.order, preparationIndex + 1),
    })),
  })).filter((item) => item.name && item.preparations.length);
  const caffeineFreeOptions = normalizeItems(value.caffeineFreeOptions, 30, (item, index) => ({
    id: cleanId(item.id, `caffeine-free-${index + 1}`),
    name: cleanText(item.name, 80),
    active: item.active !== false,
    order: normalizeOrder(item.order, index + 1),
  })).filter((item) => item.name);
  return {
    enabled: Boolean(value.enabled),
    notice: cleanText(value.notice, 500),
    changeNotice: cleanText(value.changeNotice, 500),
    coffeeFlavors: uniqueIds(coffeeFlavors).sort(byOrder),
    caffeineFreeOptions: uniqueIds(caffeineFreeOptions).sort(byOrder),
  };
}

export function resolveDrinkSelection(settingsValue, selection, { allowMissing = false } = {}) {
  const settings = normalizeDrinkSettings(settingsValue);
  if (!settings.enabled) return null;
  if (!selection || typeof selection !== 'object') {
    if (allowMissing) return null;
    throw new Error('請選擇飲品。');
  }
  if (selection.category === 'coffee') {
    const flavorItem = settings.coffeeFlavors.find((item) => item.id === selection.flavorId && item.active);
    const preparationItem = flavorItem?.preparations.find((item) => item.id === selection.preparationId && item.active);
    if (!flavorItem || !preparationItem) throw new Error('飲品選項無效或已停用。');
    return {
      category: 'coffee',
      flavorId: flavorItem.id,
      preparationId: preparationItem.id,
      displayName: `${flavorItem.name}咖啡／${preparationItem.name}`,
    };
  }
  if (selection.category === 'caffeine-free') {
    const optionItem = settings.caffeineFreeOptions.find((item) => item.id === selection.optionId && item.active);
    if (!optionItem) throw new Error('飲品選項無效或已停用。');
    return {
      category: 'caffeine-free',
      optionId: optionItem.id,
      displayName: optionItem.name,
    };
  }
  throw new Error('飲品選項無效或已停用。');
}

export function normalizeParticipantDetails(players = [], details = {}) {
  return Object.fromEntries(players.map((player) => {
    const source = details?.[player] && typeof details[player] === 'object' ? details[player] : {};
    return [player, {
      phone: cleanText(source.phone, 40),
      notes: cleanText(source.notes, 500),
      answers: normalizeAnswers(source.answers),
      drink: normalizeSavedDrink(source.drink),
    }];
  }));
}

export function normalizePhone(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('886')) digits = `0${digits.slice(3)}`;
  return digits;
}

export function createDrinkSummary(tournament) {
  const counts = new Map();
  let missingCount = 0;
  for (const player of tournament.players || []) {
    const displayName = String(tournament.participantDetails?.[player]?.drink?.displayName || '').trim();
    if (!displayName) {
      missingCount += 1;
      continue;
    }
    counts.set(displayName, (counts.get(displayName) || 0) + 1);
  }
  const items = [...counts.entries()].map(([displayName, count]) => ({ displayName, count }));
  const selectedCount = items.reduce((total, item) => total + item.count, 0);
  const lines = items.map((item) => `${item.displayName}：${item.count} 杯`);
  if (missingCount) lines.push(`尚未選擇：${missingCount} 人`);
  lines.push(`總計：${selectedCount} 杯`);
  return { items, selectedCount, missingCount, copyText: lines.join('\n') };
}

function normalizeSavedDrink(value) {
  if (!value || typeof value !== 'object' || !String(value.displayName || '').trim()) return null;
  const displayName = cleanText(value.displayName, 140);
  if (value.category === 'coffee') {
    return {
      category: 'coffee',
      flavorId: cleanId(value.flavorId, ''),
      preparationId: cleanId(value.preparationId, ''),
      displayName,
    };
  }
  if (value.category === 'caffeine-free') {
    return { category: 'caffeine-free', optionId: cleanId(value.optionId, ''), displayName };
  }
  return { category: 'legacy', displayName };
}

function normalizeAnswers(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).slice(0, 20).map(([key, answer]) => [
    cleanId(key, ''),
    typeof answer === 'boolean' ? answer : cleanText(answer, 1000),
  ]).filter(([key]) => key));
}

function normalizeItems(value, maximum, mapper) {
  return Array.isArray(value)
    ? value.filter((item) => item && typeof item === 'object' && !Array.isArray(item)).slice(0, maximum).map(mapper)
    : [];
}

function uniqueIds(items) {
  const ids = new Set();
  return items.filter((item) => {
    if (!item.id || ids.has(item.id)) return false;
    ids.add(item.id);
    if (item.preparations) item.preparations = uniqueIds(item.preparations);
    return true;
  });
}

function cleanText(value, maximumLength) {
  return String(value || '').trim().slice(0, maximumLength);
}

function cleanId(value, fallback) {
  return String(value || fallback || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 60);
}

function normalizeOrder(value, fallback) {
  const order = Number(value);
  return Number.isFinite(order) ? order : fallback;
}

function byOrder(left, right) {
  return left.order - right.order;
}

function flavor(id, name, order, preparations) {
  return { id, name, active: true, order, preparations };
}

function preparation(id, name, order) {
  return { id, name, active: true, order };
}

function option(id, name, order) {
  return { id, name, active: true, order };
}

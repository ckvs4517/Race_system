/** 飲品設定、合法選項、歷史顯示名稱與統計的領域測試。 */
import assert from 'node:assert/strict';
import {
  createDefaultDrinkSettings,
  createDrinkSummary,
  normalizeDrinkSettings,
  normalizePhone,
  resolveDrinkSelection,
} from '../src/domain/drinks.js';
import { addDraftPlayer, createTournament, updateDraftTournament } from '../src/domain/tournament.js';

const settings = createDefaultDrinkSettings();
assert.equal(settings.enabled, true);
assert.equal(settings.coffeeFlavors.length, 3);
assert.equal(settings.caffeineFreeOptions.length, 3);

const coconutCola = resolveDrinkSelection(settings, {
  category: 'coffee',
  flavorId: 'coffee-coconut',
  preparationId: 'cola',
});
assert.equal(coconutCola.displayName, '椰子咖啡／加可樂');

assert.throws(() => resolveDrinkSelection(settings, {
  category: 'coffee',
  flavorId: 'coffee-blueberry',
  preparationId: 'cola',
}), /飲品選項/);

const disabled = normalizeDrinkSettings({
  ...settings,
  caffeineFreeOptions: settings.caffeineFreeOptions.map((option) => (
    option.id === 'juice' ? { ...option, active: false } : option
  )),
});
assert.throws(() => resolveDrinkSelection(disabled, {
  category: 'caffeine-free',
  optionId: 'juice',
}), /飲品選項/);

const summary = createDrinkSummary({
  players: ['甲', '乙', '丙'],
  participantDetails: {
    甲: { drink: coconutCola },
    乙: { drink: { category: 'caffeine-free', optionId: 'juice', displayName: '舊版果汁' } },
    丙: {},
  },
});
assert.deepEqual(summary.items, [
  { displayName: '椰子咖啡／加可樂', count: 1 },
  { displayName: '舊版果汁', count: 1 },
]);
assert.equal(summary.selectedCount, 2);
assert.equal(summary.missingCount, 1);
assert.match(summary.copyText, /尚未選擇：1 人/);

assert.equal(normalizePhone('+886 912-345-678'), '0912345678');
assert.equal(normalizePhone('0912 345 678'), '0912345678');

let menuTournament = createTournament('菜單保護測試', []);
menuTournament = addDraftPlayer(menuTournament, '甲', { drink: { category: 'caffeine-free', optionId: 'juice' } });
const removedSelectedOption = {
  ...menuTournament.drinkSettings,
  caffeineFreeOptions: menuTournament.drinkSettings.caffeineFreeOptions.filter((item) => item.id !== 'juice'),
};
assert.throws(
  () => updateDraftTournament(menuTournament, menuTournament.name, menuTournament.players, menuTournament.format, menuTournament.arenaCount, menuTournament.eventInfo, removedSelectedOption),
  /不能刪除/,
);

console.log('PASS drink settings and summary');

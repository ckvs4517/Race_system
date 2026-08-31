import { readFileSync, writeFileSync } from 'node:fs';

function edit(path, mutate) {
  const before = readFileSync(path, 'utf8');
  const after = mutate(before);
  if (after === before) throw new Error(`${path}: no changes applied`);
  writeFileSync(path, after);
}

function exact(source, from, to, label) {
  if (!source.includes(from)) throw new Error(`missing pattern: ${label}`);
  return source.replace(from, to);
}

// New tournaments no longer enable the drink workflow by default. Legacy drink data remains normalized/readable.
edit('src/domain/tournament/factory.js', (source) => {
  source = exact(source,
    "import { createDefaultDrinkSettings, normalizeDrinkSettings, normalizeParticipantDetails } from '../drinks.js';",
    "import { createEmptyDrinkSettings, normalizeDrinkSettings, normalizeParticipantDetails } from '../drinks.js';",
    'factory drink import');
  source = exact(source,
    "export function createTournamentRecord(name, players, formatId = 'single_elimination', arenaCount = 1, eventInfo = {}, drinkSettings = createDefaultDrinkSettings()) {",
    "export function createTournamentRecord(name, players, formatId = 'single_elimination', arenaCount = 1, eventInfo = {}, drinkSettings = createEmptyDrinkSettings(), participantDetailsValue = {}) {",
    'factory signature');
  source = exact(source,
    'participantDetails: normalizeParticipantDetails(cleanPlayers),',
    'participantDetails: normalizeParticipantDetails(cleanPlayers, participantDetailsValue),',
    'factory participant details');
  source = exact(source,
    'drinkSettings: normalizeDrinkSettings(drinkSettings, createDefaultDrinkSettings()),',
    'drinkSettings: normalizeDrinkSettings(drinkSettings, createEmptyDrinkSettings()),',
    'factory empty drink fallback');
  return source;
});

edit('src/domain/tournament/lifecycle.js', (source) => {
  source = exact(source,
    "import { createDefaultDrinkSettings, normalizeDrinkSettings, normalizeParticipantDetails } from '../drinks.js';",
    "import { createEmptyDrinkSettings, normalizeDrinkSettings, normalizeParticipantDetails } from '../drinks.js';",
    'lifecycle drink import');
  source = exact(source,
    "export function createTournament(name, players, formatId = 'single_elimination', arenaCount = 1, eventInfo = {}, drinkSettings = createDefaultDrinkSettings()) {\n  return createTournamentRecord(name, players, formatId, arenaCount, eventInfo, drinkSettings);\n}",
    "export function createTournament(name, players, formatId = 'single_elimination', arenaCount = 1, eventInfo = {}, drinkSettings = createEmptyDrinkSettings(), participantDetailsValue = {}) {\n  return createTournamentRecord(name, players, formatId, arenaCount, eventInfo, drinkSettings, participantDetailsValue);\n}",
    'createTournament signature');
  source = exact(source,
    'export function updateDraftTournament(tournament, name, players, formatId = tournament.format, arenaCount = tournament.arenaCount || 1, eventInfo = tournament.eventInfo || {}, drinkSettings = tournament.drinkSettings) {',
    'export function updateDraftTournament(tournament, name, players, formatId = tournament.format, arenaCount = tournament.arenaCount || 1, eventInfo = tournament.eventInfo || {}, drinkSettings = tournament.drinkSettings, participantDetailsValue = null) {',
    'updateDraftTournament signature');
  source = exact(source,
    'const participantDetails = normalizeParticipantDetails(cleanPlayers, normalized.participantDetails);',
    'const participantDetails = normalizeParticipantDetails(cleanPlayers, participantDetailsValue || normalized.participantDetails);',
    'update draft participant details');
  return source;
});

// Legacy drink-enabled drafts must remain operable even though the new registration UI no longer submits a drink.
edit('src/domain/tournament/registration.js', (source) => exact(source,
  'const drink = resolveDrinkSelection(normalized.drinkSettings, registration?.drink);',
  'const drink = resolveDrinkSelection(normalized.drinkSettings, registration?.drink, { allowMissing: true });',
  'registration optional legacy drink'));

edit('src/views/manage.js', (source) => {
  source = exact(source,
    "import { createDefaultDrinkSettings, normalizeDrinkSettings } from '../domain/drinks.js';",
    "import { createEmptyDrinkSettings } from '../domain/drinks.js';",
    'manage drink import');
  source = exact(source,
    "  const playerText = tournament?.players?.join('\\n') || '';\n",
    "  const participantRows = (tournament?.players || []).map((player) => participantEditorRow(player, tournament?.participantDetails?.[player]?.notes || '', player)).join('');\n",
    'manage participant rows');
  source = exact(source,
    "  const drinkSettings = normalizeDrinkSettings(tournament?.drinkSettings || createDefaultDrinkSettings(), createDefaultDrinkSettings());\n",
    '',
    'remove manage drink settings');
  source = exact(source,
    `        <div class="step-heading"><span>03</span><div><b>參賽者名單</b><small>可先留空再建立私密填寫連結，或一行手動輸入一位，最多 \${MAX_TOURNAMENT_PLAYERS} 位</small></div></div>\n        <label class="field"><span>選手名稱</span><textarea name="players" placeholder="小明&#10;阿龍&#10;Spin Master&#10;烈焰之翼">\${escapeText(playerText)}</textarea></label>\n        <div class="step-heading"><span>04</span><div><b>飲品菜單</b><small>每場賽事可獨立啟用、改名、停用與排序。</small></div></div>\n        \${drinkSettingsEditor(drinkSettings)}\n`,
    `        <div class="step-heading"><span>03</span><div><b>參賽者名單</b><small>逐筆可記錄備註；大量名單仍可一次貼上，最多 \${MAX_TOURNAMENT_PLAYERS} 位</small></div></div>\n        <div class="manage-participant-list" data-manage-participant-list>\${participantRows}</div>\n        <div class="manage-participant-actions">\n          <button type="button" class="button button-secondary" data-manage-add-player>＋ 新增選手</button>\n          <details class="manage-participant-bulk"><summary>批次貼上選手名稱</summary><div>\n            <label class="field"><span>一行一位</span><textarea data-manage-bulk-players placeholder="小明&#10;阿龍&#10;Spin Master&#10;烈焰之翼"></textarea><small>只加入尚未存在的名稱；加入後可逐筆補上電話末五碼、飲品或其他備註。</small></label>\n            <button type="button" class="button button-secondary" data-manage-apply-bulk>加入名單</button>\n          </div></details>\n        </div>\n`,
    'manage participant UI');
  source = exact(source,
    '<li><i></i>保留手動輸入名單</li>',
    '<li><i></i>支援批次貼上與逐筆備註</li>',
    'manage aside roster copy');
  source = exact(source,
    `export function bindManage(root, options) {\n  const form = root.querySelector('[data-tournament-form]');\n  const players = form.elements.players;\n  const count = root.querySelector('[data-player-count]');\n  const getPlayers = () => players.value.split('\\n').map((value) => value.trim()).filter(Boolean);`,
    `export function bindManage(root, options) {\n  const form = root.querySelector('[data-tournament-form]');\n  const participantList = root.querySelector('[data-manage-participant-list]');\n  const count = root.querySelector('[data-player-count]');\n  const getParticipants = () => [...participantList.querySelectorAll('[data-manage-participant-row]')].map((row) => ({\n    name: row.querySelector('[name="participantName"]').value.trim(),\n    notes: row.querySelector('[name="participantNotes"]').value.trim(),\n    originalName: row.dataset.originalName || '',\n  })).filter((item) => item.name);\n  const syncParticipantCount = () => { count.textContent = \`目前 \${getParticipants().length} 位參賽者\`; };\n  const appendParticipant = (name = '', notes = '', originalName = '') => {\n    participantList.insertAdjacentHTML('beforeend', participantEditorRow(name, notes, originalName));\n    syncParticipantCount();\n  };`,
    'bind manage participant setup');
  source = exact(source,
    "  players.addEventListener('input', () => { count.textContent = `目前 ${getPlayers().length} 位參賽者`; });\n",
    "  participantList.addEventListener('input', syncParticipantCount);\n",
    'manage count listener');
  const oldDrinkBindings = `  root.querySelector('[data-drink-enabled]')?.addEventListener('change', (event) => {\n    root.querySelector('[data-drink-menu]').hidden = !event.currentTarget.checked;\n  });\n  root.querySelector('[data-drink-menu]')?.addEventListener('click', (event) => {\n    const button = event.target.closest('[data-menu-action]');\n    if (!button) return;\n    const row = button.closest('[data-menu-row]');\n    const list = row?.parentElement;\n    if (button.dataset.menuAction === 'remove' && row) row.remove();\n    if (button.dataset.menuAction === 'up' && row?.previousElementSibling) list.insertBefore(row, row.previousElementSibling);\n    if (button.dataset.menuAction === 'down' && row?.nextElementSibling) list.insertBefore(row.nextElementSibling, row);\n    if (button.dataset.menuAction === 'add-drink') root.querySelector('[data-drink-list]').insertAdjacentHTML('beforeend', optionRow({ id: uniqueId('drink'), name: '', active: true }));\n  });\n`;
  const participantBindings = `  participantList.addEventListener('click', (event) => {\n    const button = event.target.closest('[data-manage-remove-player]');\n    if (!button) return;\n    button.closest('[data-manage-participant-row]')?.remove();\n    syncParticipantCount();\n  });\n  root.querySelector('[data-manage-add-player]')?.addEventListener('click', () => appendParticipant());\n  root.querySelector('[data-manage-apply-bulk]')?.addEventListener('click', () => {\n    const bulk = root.querySelector('[data-manage-bulk-players]');\n    const existing = new Set(getParticipants().map((item) => item.name));\n    bulk.value.split('\\n').map((value) => value.trim()).filter(Boolean).forEach((name) => {\n      if (existing.has(name)) return;\n      appendParticipant(name);\n      existing.add(name);\n    });\n    bulk.value = '';\n  });\n`;
  source = exact(source, oldDrinkBindings, participantBindings, 'manage participant bindings');
  source = exact(source,
    '    const playerList = getPlayers();',
    '    const participants = getParticipants();\n    const playerList = participants.map((item) => item.name);',
    'manage submit participants');
  source = exact(source,
    `    try {\n      const eventInfo = {`,
    `    try {\n      const participantDetails = Object.fromEntries(participants.map(({ name, notes, originalName }) => {\n        const previous = options.tournament?.participantDetails?.[originalName] || {};\n        return [name, { ...previous, notes }];\n      }));\n      const eventInfo = {`,
    'manage participant details map');
  source = exact(source,
    `      const drinkSettings = readDrinkSettings(form);\n      let result = options.tournament\n        ? updateDraftTournament(options.tournament, form.elements.name.value, playerList, form.elements.format.value, form.elements.arenaCount.value, eventInfo, drinkSettings)\n        : createTournament(form.elements.name.value, playerList, form.elements.format.value, form.elements.arenaCount.value, eventInfo, drinkSettings);`,
    `      // 編輯舊賽事時原樣保留 legacy drink data；新賽事預設使用停用的空飲品設定。\n      const drinkSettings = options.tournament?.drinkSettings || createEmptyDrinkSettings();\n      let result = options.tournament\n        ? updateDraftTournament(options.tournament, form.elements.name.value, playerList, form.elements.format.value, form.elements.arenaCount.value, eventInfo, drinkSettings, participantDetails)\n        : createTournament(form.elements.name.value, playerList, form.elements.format.value, form.elements.arenaCount.value, eventInfo, drinkSettings, participantDetails);`,
    'manage preserve legacy drink');

  const helperMarker = '\nfunction defaultEventSchedule(now = new Date()) {';
  if (!source.includes(helperMarker)) throw new Error('missing participant helper insertion point');
  source = source.replace(helperMarker, `\nfunction participantEditorRow(player = '', notes = '', originalName = '') {\n  return \`<div class="manage-participant-row" data-manage-participant-row data-original-name="\${escapeAttribute(originalName)}">\n    <label class="field"><span>選手名稱</span><input name="participantName" maxlength="60" autocomplete="off" value="\${escapeAttribute(player)}" placeholder="輸入選手名稱"></label>\n    <label class="field"><span>備註</span><input name="participantNotes" maxlength="500" value="\${escapeAttribute(notes)}" placeholder="例如：12345 · 無糖綠茶 · 已付款"></label>\n    <button type="button" class="button button-secondary button-danger-quiet" data-manage-remove-player>移除</button>\n  </div>\`;\n}\n${helperMarker}`);

  const drinkHelpers = /\nfunction drinkSettingsEditor\(settings\) \{[\s\S]*?\nfunction swissRankingRuleDescription/;
  if (!drinkHelpers.test(source)) throw new Error('missing manage drink helper block');
  source = source.replace(drinkHelpers, '\nfunction swissRankingRuleDescription');
  source = source.replace(/\nfunction uniqueId\(prefix\) \{[\s\S]*?\n\}\n\nfunction escapeAttribute/, '\nfunction escapeAttribute');
  return source;
});

edit('src/views/schedule/participant-panels.js', (source) => {
  source = exact(source, "import { createDrinkSummary } from '../../domain/drinks.js';\n", '', 'remove drink summary import');
  source = exact(source, "import { drinkSelectionFields } from '../drink-fields.js';\n", '', 'remove drink fields import');
  source = exact(source,
    '<p>請只傳給已確認資格的參賽者；送出後會直接加入正式名單。</p>',
    '<p>請只傳給已確認資格的參賽者；送出後會直接加入正式名單，備註可用來記錄電話末五碼、飲品或現場事項。</p>',
    'registration quick copy');
  source = exact(source,
    '<p>主辦方確認參賽資格與付款後，再把連結交給選手填寫聯絡與飲品資料。</p>',
    '<p>主辦方確認參賽資格與付款後，再把連結交給選手填寫聯絡與備註資料。</p>',
    'registration setup copy');
  source = exact(source,
    `    const details = tournament.participantDetails?.[player] || {};\n    return \`<div class="check-in-row \${checkedIn ? 'is-checked-in' : ''}" data-roster-player="\${escapeAttribute(player)}" data-checked-in="\${checkedIn}">\n      <label class="check-in-choice"><input type="checkbox" data-check-in-player="\${escapeAttribute(player)}" \${checkedIn ? 'checked' : ''} \${canManage ? '' : 'disabled'}><span><b>\${escapeText(player)}</b>\${canManage ? \`<small>\${escapeText(details.drink?.displayName || '尚未選擇飲品')}</small>\` : ''}</span></label>`,
    `    const details = tournament.participantDetails?.[player] || {};\n    const rosterNote = String(details.notes || '').trim() || (details.drink?.displayName ? \`舊飲品：\${details.drink.displayName}\` : '');\n    return \`<div class="check-in-row \${checkedIn ? 'is-checked-in' : ''}" data-roster-player="\${escapeAttribute(player)}" data-checked-in="\${checkedIn}">\n      <label class="check-in-choice"><input type="checkbox" data-check-in-player="\${escapeAttribute(player)}" \${checkedIn ? 'checked' : ''} \${canManage ? '' : 'disabled'}><span><b>\${escapeText(player)}</b>\${canManage && rosterNote ? \`<small>\${escapeText(rosterNote)}</small>\` : ''}</span></label>`,
    'check-in roster note');
  source = exact(source,
    `        <label><span>聯絡電話（選填）</span><input name="phone" type="tel" maxlength="40" autocomplete="tel"></label>\n        \${drinkSelectionFields(tournament.drinkSettings, null, { prefix: 'addDrink' })}`,
    `        <label><span>聯絡電話（選填）</span><input name="phone" type="tel" maxlength="40" autocomplete="tel"></label>\n        <label><span>備註（選填）</span><textarea name="notes" maxlength="500" placeholder="例如：12345 · 無糖綠茶 · 已付款"></textarea></label>`,
    'add player notes field');
  source = exact(source,
    `        <label><span>聯絡電話</span><input name="phone" type="tel" maxlength="40"></label>\n        <div data-edit-drink-slot></div>`,
    `        <label><span>聯絡電話</span><input name="phone" type="tel" maxlength="40"></label>\n        <label><span>備註</span><textarea name="notes" maxlength="500" placeholder="例如：12345 · 無糖綠茶 · 已付款"></textarea></label>`,
    'edit player notes field');
  source = exact(source,
    '    ${canManage ? drinkSummaryView(tournament) : \'\'}\n',
    '',
    'remove check-in drink summary');
  source = source.replace(/\nfunction drinkSummaryView\(tournament\) \{[\s\S]*?\n\}/, '');
  return source;
});

edit('src/features/schedule/controller.js', (source) => {
  source = exact(source,
    "import { bindDrinkSelectionFields, drinkSelectionFields, readDrinkSelection } from '../../views/drink-fields.js';\n",
    '',
    'controller drink imports');
  source = exact(source, '  bindDrinkSelectionFields(root);\n', '', 'controller bind drinks');
  source = exact(source,
    `      const drink = readDrinkSelection(event.currentTarget.querySelector('[data-drink-fields]'));\n      await executeTournamentAction(state.selectedTournamentId, 'add_player', {\n        player: name,\n        details: { phone: event.currentTarget.elements.phone.value, drink },\n      });`,
    `      await executeTournamentAction(state.selectedTournamentId, 'add_player', {\n        player: name,\n        details: { phone: event.currentTarget.elements.phone.value, notes: event.currentTarget.elements.notes.value },\n      });`,
    'controller add participant notes');
  source = exact(source,
    `    form.elements.phone.value = details.phone || '';\n    const slot = form.querySelector('[data-edit-drink-slot]');\n    slot.innerHTML = drinkSelectionFields(tournament.drinkSettings, details.drink, { prefix: 'editDrink' });\n    bindDrinkSelectionFields(slot);`,
    `    form.elements.phone.value = details.phone || '';\n    form.elements.notes.value = details.notes || '';`,
    'controller edit notes preload');
  source = exact(source,
    `    const details = { phone: form.elements.phone.value };\n    const drink = readDrinkSelection(form.querySelector('[data-drink-fields]'));\n    if (drink !== undefined) details.drink = drink;`,
    `    const details = { phone: form.elements.phone.value, notes: form.elements.notes.value };`,
    'controller edit notes submit');
  source = source.replace(/\n  root\.querySelector\('\[data-copy-drink-summary\]'\)\?\.addEventListener\('click',[\s\S]*?\n  \}\);/, '');
  return source;
});

edit('src/views/registration.js', (source) => {
  source = exact(source,
    "import { bindDrinkSelectionFields, drinkSelectionFields, drinkSelectionLabel, readDrinkSelection } from './drink-fields.js';\n",
    '',
    'registration drink import');
  source = exact(source,
    `    const drink = escapeText(model.result?.participant?.drink?.displayName || '');\n    return page('資料已送出', \`<div class="registration-success"><h2>已加入正式參賽名單</h2><p>\${name}\${drink ? \` · \${drink}\` : ''}</p><p>資料如需更改，請聯絡主辦人。</p></div>\`);`,
    `    return page('資料已送出', \`<div class="registration-success"><h2>已加入正式參賽名單</h2><p>\${name}</p><p>資料如需更改，請聯絡主辦人。</p></div>\`);`,
    'registration success no drink');
  source = exact(source,
    "  const drinks = drinkSelectionFields(tournament.drinkSettings, null, { required: true, prefix: 'registrationDrink' });\n",
    '',
    'registration drink fields const');
  source = exact(source,
    `      \${tournament.drinkSettings?.notice ? \`<p class="drink-notice">\${escapeText(tournament.drinkSettings.notice)}</p>\` : ''}\n      \${drinks}\n      \${tournament.drinkSettings?.changeNotice ? \`<p class="registration-privacy">\${escapeText(tournament.drinkSettings.changeNotice)}</p>\` : ''}\n`,
    '',
    'registration drink UI');
  source = exact(source,
    '      <p class="registration-privacy">送出前請再次確認名稱、電話與飲品。送出後資料會直接進入正式名單。</p>',
    '      <p class="registration-privacy">送出前請再次確認名稱、電話與備註。送出後資料會直接進入正式名單。</p>',
    'registration privacy copy');
  source = exact(source, '  bindDrinkSelectionFields(form);\n', '', 'registration bind drinks');
  source = exact(source,
    `    const name = form.elements.displayName.value.trim() || '尚未輸入名稱';\n    const drinkFields = form.querySelector('[data-drink-fields]');\n    const drink = drinkFields ? drinkSelectionLabel(drinkFields).replace('將選擇：', '') : '本場未啟用飲品';\n    form.querySelector('[data-registration-confirmation]').textContent = \`送出內容：\${name} · \${drink}\`;`,
    `    const name = form.elements.displayName.value.trim() || '尚未輸入名稱';\n    const notes = form.elements.notes.value.trim();\n    form.querySelector('[data-registration-confirmation]').textContent = \`送出內容：\${name}\${notes ? \` · 備註：\${notes}\` : ''}\`;`,
    'registration confirmation');
  source = exact(source,
    `      const drink = readDrinkSelection(form.querySelector('[data-drink-fields]'));\n      const label = drinkSelectionLabel(form.querySelector('[data-drink-fields]'));\n      if (!window.confirm(\`確認送出「\${form.elements.displayName.value.trim()}」\${label ? \`，飲品\${label.replace('將選擇：', '')}\` : ''}？\\n送出後將直接加入正式名單。\`)) return;`,
    `      if (!window.confirm(\`確認送出「\${form.elements.displayName.value.trim()}」？\\n送出後將直接加入正式名單。\`)) return;`,
    'registration submit confirm');
  source = exact(source,
    `        answers,\n        drink,`,
    `        answers,`,
    'registration submit payload');
  return source;
});

edit('src/views/registration-admin.js', (source) => {
  source = exact(source, '/** 主辦方參賽資料填寫管理：私密連結、正式名單與飲品統計。 */', '/** 主辦方參賽資料填寫管理：私密連結、正式名單與參賽備註。 */', 'registration admin comment');
  source = exact(source, "import { createDrinkSummary } from '../domain/drinks.js';\n", '', 'registration admin drink import');
  source = exact(source, '  const summary = createDrinkSummary(selected);\n', '', 'registration admin summary');
  source = exact(source,
    `    return \`<article class="registration-row"><div><b>\${escapeText(player)}</b><span>\${escapeText(details.phone || '未填電話')}</span><small>\${escapeText(details.drink?.displayName || '尚未選擇飲品')}</small></div></article>\`;`,
    `    const note = String(details.notes || '').trim() || (details.drink?.displayName ? \`舊飲品：\${details.drink.displayName}\` : '');\n    return \`<article class="registration-row"><div><b>\${escapeText(player)}</b><span>\${escapeText(details.phone || '未填電話')}</span>\${note ? \`<small>\${escapeText(note)}</small>\` : ''}</div></article>\`;`,
    'registration admin participant note');
  source = source.replace(/\n        \$\{selected\.drinkSettings\?\.enabled \? `<div class="drink-summary">[\s\S]*?` : ''\}/, '');
  source = source.replace(/\n  root\.querySelector\('\[data-copy-drink-summary\]'\)\?\.addEventListener\('click',[^\n]*\);/, '');
  return source;
});

edit('src/views/guide.js', (source) => {
  source = exact(source,
    "  ['03', '確認名單與飲品', '在報到頁查看聯絡方式、飲品與統計；也能新增現場選手或編輯資料。需要刪除時先進入「管理名單」，避免手機誤觸。'],",
    "  ['03', '確認名單與備註', '在報到頁直接查看每位選手備註；電話末五碼、飲品、付款或現場事項都可集中記錄。也能新增現場選手或編輯資料。需要刪除時先進入「管理名單」，避免手機誤觸。'],",
    'guide roster notes');
  source = exact(source,
    '<li>在報到頁確認名稱、電話與飲品；飲品統計可一鍵複製</li>',
    '<li>在報到頁確認名稱與備註；電話末五碼、飲品或其他現場資訊都可直接寫在備註</li>',
    'guide before start notes');
  return source;
});

edit('src/styles/features/tournament-management.css', (source) => {
  if (source.includes('.manage-participant-list')) throw new Error('participant styles already exist');
  const marker = '.form-footer { display: flex; align-items: center; justify-content: space-between; margin-top: 25px; padding-top: 22px; border-top: 1px solid var(--line); }';
  if (!source.includes(marker)) throw new Error('missing tournament management style marker');
  const styles = `\n.manage-participant-list { display: flex; flex-direction: column; gap: 10px; }\n.manage-participant-row { display: flex; flex-wrap: wrap; align-items: end; gap: 10px; padding: 12px; background: #080b10; border: 1px solid var(--line); border-radius: 8px; }\n.manage-participant-row .field { flex: 1 1 220px; margin: 0; }\n.manage-participant-row .field > span { margin-bottom: 6px; }\n.manage-participant-row .button { flex: 0 0 auto; min-height: 45px; }\n.manage-participant-actions { display: flex; flex-wrap: wrap; align-items: start; gap: 10px; margin-top: 12px; }\n.manage-participant-bulk { flex: 1 1 320px; background: #0b1017; border: 1px solid var(--line); border-radius: 8px; }\n.manage-participant-bulk summary { padding: 12px 14px; color: #c6cbd3; font-size: 11px; font-weight: 800; cursor: pointer; }\n.manage-participant-bulk > div { padding: 0 14px 14px; }\n.manage-participant-bulk textarea { min-height: 110px; }\n`;
  return source.replace(marker, styles + marker);
});

// Regression coverage.
edit('tests/check-in.test.mjs', (source) => {
  source = exact(source,
    "import { scheduleView } from '../src/views/schedule.js';",
    "import { createDefaultDrinkSettings } from '../src/domain/drinks.js';\nimport { scheduleView } from '../src/views/schedule.js';",
    'check-in legacy drink import');
  source = exact(source,
    "assert.ok(tournament.players.every((player) => tournament.participantStates[player].checkedIn === false));",
    "assert.ok(tournament.players.every((player) => tournament.participantStates[player].checkedIn === false));\nassert.equal(tournament.drinkSettings.enabled, false, '新賽事預設不啟用飲品菜單');",
    'check-in new drink default');
  source = exact(source,
    'assert.match(view, /飲品統計/);',
    "assert.doesNotMatch(view, /飲品統計/, '新賽事報到頁不再顯示飲品統計');\nassert.doesNotMatch(view, /尚未選擇飲品/, '名單不再用飲品 placeholder 佔據備註位置');",
    'check-in no drink UI');
  source = exact(source,
    `tournament = addDraftPlayer(tournament, '現場選手', {\n  phone: '0912345678',\n  drink: { itemId: 'juice' },\n});\nassert.equal(tournament.players.length, 5);\nassert.equal(tournament.participantStates['現場選手'].checkedIn, false);\nassert.equal(tournament.participantDetails['現場選手'].drink.displayName, '果汁(無咖啡因)');\ntournament = updateDraftParticipant(tournament, '現場選手', '現場選手（已確認）', { phone: '0987654321' });\nassert.equal(tournament.participantDetails['現場選手（已確認）'].drink.displayName, '果汁(無咖啡因)', '編輯聯絡資料時保留原飲品');`,
    `tournament = addDraftPlayer(tournament, '現場選手', {\n  phone: '0912345678',\n  notes: '12345 · 果汁 · 現場付款',\n});\nassert.equal(tournament.players.length, 5);\nassert.equal(tournament.participantStates['現場選手'].checkedIn, false);\nassert.equal(tournament.participantDetails['現場選手'].notes, '12345 · 果汁 · 現場付款');\nview = scheduleView([tournament], tournament.id, true);\nassert.match(view, /12345 · 果汁 · 現場付款/, '管理者報到名單直接顯示備註');\nassert.doesNotMatch(scheduleView([tournament], tournament.id, false), /12345 · 果汁 · 現場付款/, '公開頁不顯示私人備註');\ntournament = updateDraftParticipant(tournament, '現場選手', '現場選手（已確認）', { phone: '0987654321' });\nassert.equal(tournament.participantDetails['現場選手（已確認）'].notes, '12345 · 果汁 · 現場付款', '改名或更新聯絡資料時保留原備註');`,
    'check-in notes roundtrip');
  const insert = `\nlet legacyDrinkTournament = createTournament('舊飲品相容', ['舊A', '舊B'], 'single_elimination', 1, {}, createDefaultDrinkSettings());\nlegacyDrinkTournament = updateDraftParticipant(legacyDrinkTournament, '舊A', '舊A', { drink: { itemId: 'juice' } });\nassert.equal(legacyDrinkTournament.participantDetails['舊A'].drink.displayName, '果汁(無咖啡因)', '舊賽事既有飲品資料仍可保留');\nassert.match(scheduleView([legacyDrinkTournament], legacyDrinkTournament.id, true), /舊飲品：果汁\(無咖啡因\)/, '舊飲品在無備註時保留唯讀提示');\n`;
  source = source.replace("\nconst storeSource = readFileSync", insert + "\nconst storeSource = readFileSync");
  return source;
});

edit('tests/event-info.test.mjs', (source) => {
  source = exact(source,
    "import { createTournament, duplicateTournament, normalizeTournament, updateDraftTournament } from '../src/domain/tournament.js';",
    "import { createTournament, duplicateTournament, normalizeTournament, updateDraftParticipant, updateDraftTournament } from '../src/domain/tournament.js';\nimport { createDefaultDrinkSettings } from '../src/domain/drinks.js';",
    'event info imports');
  source = exact(source,
    'assert.match(editView, /name="notes"/);',
    `assert.match(editView, /name="notes"/);\nassert.match(editView, /data-manage-participant-list/);\nassert.match(editView, /name="participantNotes"/);\nassert.doesNotMatch(editView, /飲品菜單/, '建立／編輯賽事不再提供飲品菜單');`,
    'manage participant UI assertions');
  source = exact(source,
    "assert.match(newTournamentView, /name=\"mapUrl\"[^>]+https:\\/\\/maps\\.app\\.goo\\.gl\\/xtbmRtKcF84CCBec6/);",
    "assert.match(newTournamentView, /name=\"mapUrl\"[^>]+https:\\/\\/maps\\.app\\.goo\\.gl\\/xtbmRtKcF84CCBec6/);\nassert.match(newTournamentView, /data-manage-bulk-players/, '建立賽事保留批次貼上名單能力');\nassert.doesNotMatch(newTournamentView, /飲品菜單/);",
    'new manage assertions');
  const block = `\nlet noteDraft = updateDraftParticipant(tournament, 'A', 'A', { notes: '12345 · 無糖綠茶' });\nassert.match(manageView(noteDraft), /value="12345 · 無糖綠茶"/, '編輯準備中賽事會帶回既有 participant notes');\n\nlet legacyDrinkDraft = createTournament('舊飲品草稿', ['A', 'B'], 'single_elimination', 1, {}, createDefaultDrinkSettings());\nlegacyDrinkDraft = updateDraftParticipant(legacyDrinkDraft, 'A', 'A', { drink: { itemId: 'juice' }, notes: '保留備註' });\nlegacyDrinkDraft = updateDraftTournament(legacyDrinkDraft, legacyDrinkDraft.name, ['A', 'B']);\nassert.equal(legacyDrinkDraft.drinkSettings.enabled, true, '編輯舊草稿不會清掉既有 drinkSettings');\nassert.equal(legacyDrinkDraft.participantDetails.A.drink.displayName, '果汁(無咖啡因)', '編輯舊草稿不會清掉既有 participant drink');\nassert.equal(legacyDrinkDraft.participantDetails.A.notes, '保留備註');\nassert.doesNotMatch(manageView(legacyDrinkDraft), /飲品菜單/, '舊飲品資料保留但不再提供編輯 UI');\n`;
  source = source.replace("\nconst updated = updateDraftTournament", block + "\nconst updated = updateDraftTournament");
  return source;
});

edit('tests/registration.test.mjs', (source) => {
  source = exact(source,
    "import { registrationAdminView } from '../src/views/registration-admin.js';",
    "import { registrationAdminView } from '../src/views/registration-admin.js';\nimport { registrationView } from '../src/views/registration.js';",
    'registration view import');
  source = exact(source,
    "assert.equal('phone' in publicData, false, '公開報名資訊不包含報名者個資');",
    `assert.equal('phone' in publicData, false, '公開報名資訊不包含報名者個資');\nconst publicRegistrationPage = registrationView({ data: publicData });\nassert.doesNotMatch(publicRegistrationPage, /data-drink-fields/, '新的私密填寫頁不再顯示飲品選擇');\nassert.doesNotMatch(publicRegistrationPage, /確認名稱、電話與飲品/, '新的私密填寫流程不再要求飲品');`,
    'registration no drink UI assertions');
  source = exact(source,
    "body: JSON.stringify({ displayName: '選手甲', phone: '0912-345-678', notes: '第一次參賽', answers: { teamName: '烈焰隊' }, drink: { itemId: 'coffee-coconut-cola' } }),",
    "body: JSON.stringify({ displayName: '選手甲', phone: '0912-345-678', notes: '第一次參賽 · 12345 · 無糖綠茶', answers: { teamName: '烈焰隊' } }),",
    'registration submission without drink');
  source = exact(source,
    "assert.equal(latest.participantDetails['選手甲'].notes, '第一次參賽', '登入管理端仍可取得私人備註');",
    "assert.equal(latest.participantDetails['選手甲'].notes, '第一次參賽 · 12345 · 無糖綠茶', '登入管理端仍可取得私人備註');",
    'registration notes expectation');
  source = exact(source,
    "assert.equal(latest.participantDetails['選手甲'].drink.displayName, '椰子美式加汽水', '後端驗證並保存飲品顯示名稱');",
    "assert.equal(latest.participantDetails['選手甲'].drink, null, '即使舊賽事仍有 drinkSettings，新填寫也不再被要求選飲品');",
    'registration drink optional expectation');
  source = exact(source,
    "assert.match(scheduleEntryView, new RegExp(`max=\\\"${MAX_TOURNAMENT_PLAYERS}\\\"`), '報名管理畫面沿用共用人數上限');",
    "assert.match(scheduleEntryView, new RegExp(`max=\\\"${MAX_TOURNAMENT_PLAYERS}\\\"`), '報名管理畫面沿用共用人數上限');\nassert.match(scheduleEntryView, /第一次參賽 · 12345 · 無糖綠茶/, '報名管理總覽直接顯示備註');\nassert.doesNotMatch(scheduleEntryView, /飲品統計/, '報名管理不再提供飲品統計');",
    'registration admin notes assertions');
  return source;
});

edit('tests/guide.test.mjs', (source) => exact(source,
  "assert.match(guide, /管理名單/, '說明頁說明安全移除模式');",
  "assert.match(guide, /管理名單/, '說明頁說明安全移除模式');\nassert.match(guide, /確認名單與備註/, '說明頁以備註取代飲品工作流');\nassert.doesNotMatch(guide, /飲品統計/, '說明頁不再引導使用飲品統計');",
  'guide note assertions'));

edit('tests/full-flow.test.js', (source) => {
  source = exact(source,
    `  fill('[name="players"]', '旋風\\n烈焰\\n銀河\\n雷霆');`,
    `  fill('[data-manage-bulk-players]', '旋風\\n烈焰\\n銀河\\n雷霆');\n  click('[data-manage-apply-bulk]');\n  fill('[data-manage-participant-row] [name="participantNotes"]', '12345 · 無糖綠茶');`,
    'full flow new roster editor');
  source = exact(source,
    "  expectText('已報到 0／報名 4 人', '建立賽事後先顯示報到名單');",
    "  expectText('已報到 0／報名 4 人', '建立賽事後先顯示報到名單');\n  expectText('12345 · 無糖綠茶', '建立賽事時輸入的選手備註會直接顯示在報到名單');",
    'full flow note display');
  source = exact(source,
    "  fill('[data-add-draft-player-form] [name=\"playerName\"]', '現場測試選手');\n  submit('[data-add-draft-player-form]');",
    "  fill('[data-add-draft-player-form] [name=\"playerName\"]', '現場測試選手');\n  fill('[data-add-draft-player-form] [name=\"notes\"]', '54321 · 可樂');\n  submit('[data-add-draft-player-form]');",
    'full flow onsite notes');
  source = exact(source,
    "  expectText('報名 5 人', '報到名單可以新增現場選手');",
    "  expectText('報名 5 人', '報到名單可以新增現場選手');\n  expectText('54321 · 可樂', '新增現場選手可同時記錄備註');",
    'full flow onsite note display');
  return source;
});

console.log('participant notes feedback patch applied');

import { readFile, writeFile } from 'node:fs/promises';

async function replaceOnce(path, from, to) {
  const source = await readFile(path, 'utf8');
  const count = source.split(from).length - 1;
  if (count !== 1) throw new Error(`${path}: expected exactly one replacement target, found ${count}`);
  await writeFile(path, source.replace(from, to));
}

await replaceOnce(
  'src/domain/ranking/swiss-ranking.js',
  "export const DEFAULT_SWISS_RANKING_RULE = SWISS_RANKING_RULE_BUCHHOLZ;",
  "// 8/30 現場回饋後，新瑞士賽改回容易理解的傳統排名；Buchholz 僅保留既有賽事相容。\nexport const DEFAULT_SWISS_RANKING_RULE = SWISS_RANKING_RULE_LEGACY;",
);

await replaceOnce(
  'src/views/manage.js',
  `  const swissRankingRule = normalizeSwissRankingRule(\n    tournament?.swissRankingRule,\n    tournament ? SWISS_RANKING_RULE_LEGACY : DEFAULT_SWISS_RANKING_RULE,\n  );\n  const drinkSettings = normalizeDrinkSettings(tournament?.drinkSettings || createDefaultDrinkSettings(), createDefaultDrinkSettings());`,
  `  const swissRankingRule = normalizeSwissRankingRule(\n    tournament?.swissRankingRule,\n    tournament ? SWISS_RANKING_RULE_LEGACY : DEFAULT_SWISS_RANKING_RULE,\n  );\n  const swissRankingOptions = swissRankingRule === SWISS_RANKING_RULE_BUCHHOLZ\n    ? \`<option value="\${SWISS_RANKING_RULE_BUCHHOLZ}" selected>對手強度排名（既有賽事相容）</option><option value="\${SWISS_RANKING_RULE_LEGACY}">傳統排名</option>\`\n    : \`<option value="\${SWISS_RANKING_RULE_LEGACY}" selected>傳統排名</option>\`;\n  const drinkSettings = normalizeDrinkSettings(tournament?.drinkSettings || createDefaultDrinkSettings(), createDefaultDrinkSettings());`,
);

await replaceOnce(
  'src/views/manage.js',
  `          <label class="field"><span>瑞士輪排名方式</span><select name="swissRankingRule"><option value="\${SWISS_RANKING_RULE_BUCHHOLZ}" \${swissRankingRule === SWISS_RANKING_RULE_BUCHHOLZ ? 'selected' : ''}>對手強度排名（推薦）</option><option value="\${SWISS_RANKING_RULE_LEGACY}" \${swissRankingRule === SWISS_RANKING_RULE_LEGACY ? 'selected' : ''}>傳統排名（舊版相容）</option></select><small>推薦：勝場 → 對手勝場總和 → 總得分 → 直接對戰；賽事開始後鎖定。</small></label>`,
  `          <label class="field"><span>瑞士輪排名方式</span><select name="swissRankingRule">\${swissRankingOptions}</select><small data-swiss-ranking-description>\${swissRankingRuleDescription(swissRankingRule)}</small></label>`,
);

await replaceOnce(
  'src/views/manage.js',
  `  const syncSwissStage2Fields = () => {\n    const panel = root.querySelector('[data-swiss-stage2-settings]');\n    if (panel) panel.hidden = form.elements.format.value !== 'swiss';\n  };\n  players.addEventListener('input', () => { count.textContent = \`目前 \${getPlayers().length} 位參賽者\`; });\n  form.elements.format.addEventListener('change', syncSwissStage2Fields);\n  syncSwissStage2Fields();`,
  `  const syncSwissStage2Fields = () => {\n    const panel = root.querySelector('[data-swiss-stage2-settings]');\n    if (panel) panel.hidden = form.elements.format.value !== 'swiss';\n  };\n  const syncSwissRankingDescription = () => {\n    const description = root.querySelector('[data-swiss-ranking-description]');\n    if (description) description.textContent = swissRankingRuleDescription(form.elements.swissRankingRule?.value);\n  };\n  players.addEventListener('input', () => { count.textContent = \`目前 \${getPlayers().length} 位參賽者\`; });\n  form.elements.format.addEventListener('change', syncSwissStage2Fields);\n  form.elements.swissRankingRule?.addEventListener('change', syncSwissRankingDescription);\n  syncSwissStage2Fields();\n  syncSwissRankingDescription();`,
);

await replaceOnce(
  'src/views/manage.js',
  `function normalizeSwissStage2Config(value = {}) {`,
  `function swissRankingRuleDescription(rule) {\n  const normalized = normalizeSwissRankingRule(rule, SWISS_RANKING_RULE_LEGACY);\n  if (normalized === SWISS_RANKING_RULE_BUCHHOLZ) {\n    return '對手強度排名：勝場 → 對手勝場總和 → 總得分 → 兩人直接對戰；賽事開始後鎖定。';\n  }\n  return '傳統排名：勝場 → 敗場較少 → 總得分；完全同分時維持原始順序，賽事開始後鎖定。';\n}\n\nfunction normalizeSwissStage2Config(value = {}) {`,
);

await replaceOnce(
  'src/formats/swiss.js',
  `function applyBye(round, stats) {\n  const byeMatch = round.matches.find((match) => match.playerB === BYE);\n  if (!byeMatch) return;\n  stats[byeMatch.playerA].wins += 1;\n  stats[byeMatch.playerA].byeCount += 1;\n}`,
  `function applyBye(round, stats) {\n  const byeMatch = round.matches.find((match) => match.playerB === BYE);\n  if (!byeMatch) return;\n  // 輪空不是實際出賽，因此不增加 matchesPlayed；但傳統排名會比較總得分，\n  // 現場規則將輪空視為一場 4 分勝利的排名積分，避免輪空者在同勝敗下吃虧。\n  stats[byeMatch.playerA].wins += 1;\n  stats[byeMatch.playerA].pointsFor += 4;\n  stats[byeMatch.playerA].byeCount += 1;\n}`,
);

await replaceOnce(
  'tests/swiss.test.mjs',
  `assert.equal(odd.playerStats[firstBye].wins, 1, '輪空應計為一勝');\nodd = finishCurrentRound(odd);`,
  `assert.equal(odd.playerStats[firstBye].wins, 1, '輪空應計為一勝');\nassert.equal(odd.playerStats[firstBye].pointsFor, 4, '輪空應同時取得 4 分排名積分');\nassert.equal(odd.playerStats[firstBye].pointsAgainst, 0, '輪空不應增加失分');\nassert.equal(odd.playerStats[firstBye].matchesPlayed, 0, '輪空不是實際出賽，不應增加出賽場次');\nodd = finishCurrentRound(odd);`,
);

await replaceOnce(
  'tests/swiss-ranking.test.mjs',
  `  assert.equal(created.swissRankingRule, DEFAULT_SWISS_RANKING_RULE);\n  assert.equal(created.swissRankingRule, SWISS_RANKING_RULE_BUCHHOLZ);`,
  `  assert.equal(created.swissRankingRule, DEFAULT_SWISS_RANKING_RULE);\n  assert.equal(created.swissRankingRule, SWISS_RANKING_RULE_LEGACY, '新瑞士賽改回傳統排名');`,
);

await replaceOnce(
  'tests/swiss-ranking.test.mjs',
  `  assert.equal(updateDraftTournament(nonSwiss, nonSwiss.name, nonSwiss.players, 'swiss').swissRankingRule, SWISS_RANKING_RULE_BUCHHOLZ, '新切換成瑞士制時應使用新預設');`,
  `  assert.equal(updateDraftTournament(nonSwiss, nonSwiss.name, nonSwiss.players, 'swiss').swissRankingRule, SWISS_RANKING_RULE_LEGACY, '新切換成瑞士制時應使用傳統排名預設');`,
);

await replaceOnce(
  'tests/swiss-ranking.test.mjs',
  `  const tournament = createTournament('UI 測試', ['A', 'B', 'C', 'D'], 'swiss');\n  tournament.participantStates`,
  `  const tournament = { ...createTournament('UI 測試', ['A', 'B', 'C', 'D'], 'swiss'), swissRankingRule: SWISS_RANKING_RULE_BUCHHOLZ };\n  tournament.participantStates`,
);

await replaceOnce(
  'tests/swiss-ranking.test.mjs',
  `  const form = manageView(null);\n  assert.match(form, /對手強度排名（推薦）/);\n  assert.match(form, /buchholz_v1/);`,
  `  const form = manageView(null);\n  assert.match(form, /傳統排名/);\n  assert.match(form, /傳統排名：勝場 → 敗場較少 → 總得分/);\n  assert.doesNotMatch(form, /對手強度排名/);\n  assert.doesNotMatch(form, /buchholz_v1/);\n  const legacyCompatibilityForm = manageView({ ...tournament, status: '準備中' });\n  assert.match(legacyCompatibilityForm, /對手強度排名（既有賽事相容）/);\n  assert.match(legacyCompatibilityForm, /對手強度排名：勝場 → 對手勝場總和 → 總得分 → 兩人直接對戰/);`,
);

await replaceOnce(
  'tests/swiss-ranking.test.mjs',
  `  const tournament = createTournament('戰績圖測試', ['A', 'B', 'C', 'D'], 'swiss');\n  tournament.participantStates`,
  `  const tournament = { ...createTournament('戰績圖測試', ['A', 'B', 'C', 'D'], 'swiss'), swissRankingRule: SWISS_RANKING_RULE_BUCHHOLZ };\n  tournament.participantStates`,
);

console.log('Applied Swiss user-feedback patch.');

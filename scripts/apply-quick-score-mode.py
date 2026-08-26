from pathlib import Path


def replace_once(text, old, new, label):
    if old not in text:
        raise RuntimeError(f'expected block not found: {label}')
    return text.replace(old, new, 1)


# schedule.js: render the mode toggle, visual notice, and an in-page score dialog.
path = Path('src/views/schedule.js')
text = path.read_text(encoding='utf-8')
text = replace_once(
    text,
    "export function scheduleView(tournaments, selectedId, canManage = false) {\n  const selected = tournaments.find((item) => item.id === selectedId);\n  if (selected) return bracketView(selected, canManage);",
    "export function scheduleView(tournaments, selectedId, canManage = false, quickScoreMode = false) {\n  const selected = tournaments.find((item) => item.id === selectedId);\n  if (selected) return bracketView(selected, canManage, quickScoreMode);",
    'scheduleView signature',
)
text = replace_once(text, 'function bracketView(tournament, canManage) {', 'function bracketView(tournament, canManage, quickScoreMode = false) {', 'bracketView signature')
text = replace_once(
    text,
    "  const earlyFinish = canManage && tournament.status === '進行中' ? '<button class=\"button button-danger\" data-action=\"complete-tournament-early\">提前結束比賽</button>' : '';\n  const headerActions = `<div class=\"schedule-header-actions\"><button class=\"button button-secondary\" data-action=\"back-events\">← 返回列表</button>${canManage ? primaryAction : ''}${earlyFinish}${moreActions}</div>`;",
    "  const earlyFinish = canManage && tournament.status === '進行中' ? '<button class=\"button button-danger\" data-action=\"complete-tournament-early\">提前結束比賽</button>' : '';\n  const quickScoreAction = canManage && tournament.status === '進行中'\n    ? `<button type=\"button\" class=\"button button-secondary quick-score-toggle ${quickScoreMode ? 'is-active' : ''}\" data-action=\"toggle-quick-score\" aria-pressed=\"${quickScoreMode ? 'true' : 'false'}\">⚡ 快速登分${quickScoreMode ? ' ON' : ''}</button>`\n    : '';\n  const headerActions = `<div class=\"schedule-header-actions\"><button class=\"button button-secondary\" data-action=\"back-events\">← 返回列表</button>${canManage ? primaryAction : ''}${quickScoreAction}${earlyFinish}${moreActions}</div>`;",
    'schedule header actions',
)
text = replace_once(
    text,
    "  const preliminaryCount = rounds.filter((round) => (round.phase || 'preliminary') === 'preliminary').length;\n  return `<section class=\"section-wrap page-section\">${pageHeader(",
    "  const preliminaryCount = rounds.filter((round) => (round.phase || 'preliminary') === 'preliminary').length;\n  const quickScoreNotice = canManage && tournament.status === '進行中' && quickScoreMode\n    ? '<div class=\"quick-score-notice\"><b>⚡ 快速登分模式已開啟</b><span>點擊未完成對局會直接在本頁輸入裁判回報的最終比分。</span></div>'\n    : '';\n  const quickScoreDialog = canManage && tournament.status === '進行中' ? quickScoreDialogView() : '';\n  return `<section class=\"section-wrap page-section${canManage && tournament.status === '進行中' && quickScoreMode ? ' quick-score-active' : ''}\">${pageHeader(",
    'quick score section state',
)
text = replace_once(
    text,
    "${participantPanel}<div class=\"bracket-guide\">${guide}</div>${pairingPanel}",
    "${participantPanel}<div class=\"bracket-guide\">${guide}</div>${quickScoreNotice}${pairingPanel}",
    'quick score notice placement',
)
text = replace_once(text, '${bracket}${leaderboard}</section>`;', '${bracket}${leaderboard}${quickScoreDialog}</section>`;', 'quick score dialog placement')
insert_marker = '\nfunction currentRoundEntries(tournament, projectedRounds, isSwiss) {'
quick_dialog = r'''
function quickScoreDialogView() {
  return `<dialog class="mobile-sheet quick-score-dialog" data-quick-score-dialog>
    <form class="mobile-sheet-card quick-score-card" data-quick-score-form novalidate>
      <div class="mobile-sheet-heading"><div><p class="kicker">QUICK SCORE</p><h2>快速登分</h2></div><button type="button" data-quick-score-close aria-label="關閉">×</button></div>
      <div class="quick-score-context"><span data-quick-score-round>目前輪次</span><b data-quick-score-arena>戰鬥台 1</b></div>
      <div class="quick-score-grid">
        <label><span data-quick-score-player-a>選手 A</span><input type="number" min="0" step="1" inputmode="numeric" autocomplete="off" name="scoreA" aria-label="選手 A 最終分數" required></label>
        <i>:</i>
        <label><span data-quick-score-player-b>選手 B</span><input type="number" min="0" step="1" inputmode="numeric" autocomplete="off" name="scoreB" aria-label="選手 B 最終分數" required></label>
      </div>
      <p class="quick-score-help">直接輸入裁判回報的最終比分；允許 5：3、6：4 等超過 4 分的合法結果。</p>
      <p class="quick-score-error" data-quick-score-error role="alert" hidden></p>
      <div class="mobile-sheet-actions"><button type="button" class="button button-secondary" data-quick-score-close>取消</button><button type="submit" class="button button-primary" data-quick-score-submit>確認登分</button></div>
    </form>
  </dialog>`;
}
'''
if insert_marker not in text:
    raise RuntimeError('expected currentRoundEntries marker not found')
text = text.replace(insert_marker, quick_dialog + insert_marker, 1)
path.write_text(text, encoding='utf-8')


# main.js: keep mode in sessionStorage and submit from the schedule without selecting the full scoreboard route.
path = Path('src/main.js')
text = path.read_text(encoding='utf-8')
text = replace_once(
    text,
    "import { rosterPlayerMatches } from './core/roster-filter.js';\n",
    "import { rosterPlayerMatches } from './core/roster-filter.js';\nimport { readQuickScoreMode, validateQuickScoreInput, writeQuickScoreMode } from './core/quick-score.js';\n",
    'quick score import',
)
text = replace_once(
    text,
    'let checkInSaveQueue = Promise.resolve();\n',
    'let checkInSaveQueue = Promise.resolve();\nlet quickScoreDraft = null;\n',
    'quick score draft state',
)
text = replace_once(
    text,
    '      view = scheduleView(state.tournaments, state.selectedTournamentId, state.isAdmin);',
    '      view = scheduleView(state.tournaments, state.selectedTournamentId, state.isAdmin, state.isAdmin && readQuickScoreMode());',
    'schedule quick mode rendering',
)
helper_marker = '\nfunction bindScheduleEvents(state) {'
helper = r'''
function quickScoreMatch(draft, state = getState()) {
  const tournament = state.tournaments.find((item) => item.id === draft?.tournamentId);
  const round = tournament?.rounds?.[draft?.roundIndex];
  const match = round?.matches?.[draft?.matchIndex];
  return { tournament, round, match };
}

function updateQuickScoreSubmitLabel(dialog) {
  const submit = dialog.querySelector('[data-quick-score-submit]');
  const scoreA = dialog.querySelector('[name="scoreA"]')?.value.trim() || '';
  const scoreB = dialog.querySelector('[name="scoreB"]')?.value.trim() || '';
  if (!submit) return;
  const prefix = quickScoreDraft?.error ? '重新送出' : '確認登分';
  submit.textContent = scoreA !== '' && scoreB !== '' ? `${prefix} ${scoreA} : ${scoreB}` : prefix;
}

function hydrateQuickScoreDialog(dialog) {
  if (!quickScoreDraft) return false;
  const { tournament, round, match } = quickScoreMatch(quickScoreDraft);
  if (!tournament || !round || !match || tournament.status !== '進行中' || match.status !== '可開始') return false;
  dialog.querySelector('[data-quick-score-round]').textContent = `${round.name} · MATCH ${String(quickScoreDraft.matchIndex + 1).padStart(2, '0')}`;
  dialog.querySelector('[data-quick-score-arena]').textContent = quickScoreDraft.arenaLabel || '戰鬥台 1';
  dialog.querySelector('[data-quick-score-player-a]').textContent = match.playerA;
  dialog.querySelector('[data-quick-score-player-b]').textContent = match.playerB;
  const scoreA = dialog.querySelector('[name="scoreA"]');
  const scoreB = dialog.querySelector('[name="scoreB"]');
  scoreA.value = quickScoreDraft.scoreA ?? '';
  scoreB.value = quickScoreDraft.scoreB ?? '';
  const errorNode = dialog.querySelector('[data-quick-score-error]');
  errorNode.textContent = quickScoreDraft.error || '';
  errorNode.hidden = !quickScoreDraft.error;
  const submit = dialog.querySelector('[data-quick-score-submit]');
  submit.disabled = Boolean(quickScoreDraft.submitting);
  if (quickScoreDraft.submitting) submit.textContent = '正在同步賽果…';
  else updateQuickScoreSubmitLabel(dialog);
  return true;
}

function focusQuickScoreInput(dialog) {
  if (!quickScoreDraft || quickScoreDraft.submitting) return;
  const scoreA = dialog.querySelector('[name="scoreA"]');
  const scoreB = dialog.querySelector('[name="scoreB"]');
  const target = scoreA.value === '' ? scoreA : scoreB;
  target?.focus();
  target?.select?.();
}

function openQuickScoreDialog(state, card) {
  const tournament = state.tournaments.find((item) => item.id === state.selectedTournamentId);
  const roundIndex = Number(card.dataset.roundIndex);
  const matchIndex = Number(card.dataset.matchIndex);
  const match = tournament?.rounds?.[roundIndex]?.matches?.[matchIndex];
  if (!state.isAdmin || !tournament || tournament.status !== '進行中' || match?.status !== '可開始') return;
  const arenaLabel = card.closest('.battle-station')?.querySelector('.battle-station-title span')?.textContent?.trim() || '戰鬥台 1';
  quickScoreDraft = {
    tournamentId: tournament.id,
    roundIndex,
    matchIndex,
    arenaLabel,
    scoreA: '',
    scoreB: '',
    error: '',
    submitting: false,
  };
  const dialog = app.querySelector('[data-quick-score-dialog]');
  if (!dialog || !hydrateQuickScoreDialog(dialog)) return;
  if (!dialog.open) dialog.showModal();
  queueMicrotask(() => focusQuickScoreInput(dialog));
}

function bindQuickScoreDialog(state) {
  const dialog = app.querySelector('[data-quick-score-dialog]');
  if (!dialog) return;
  const form = dialog.querySelector('[data-quick-score-form]');
  const scoreA = form.querySelector('[name="scoreA"]');
  const scoreB = form.querySelector('[name="scoreB"]');
  const errorNode = form.querySelector('[data-quick-score-error]');

  const syncDraft = () => {
    if (!quickScoreDraft) return;
    quickScoreDraft.scoreA = scoreA.value;
    quickScoreDraft.scoreB = scoreB.value;
    quickScoreDraft.error = '';
    errorNode.textContent = '';
    errorNode.hidden = true;
    updateQuickScoreSubmitLabel(dialog);
  };
  scoreA.addEventListener('input', syncDraft);
  scoreB.addEventListener('input', syncDraft);
  scoreA.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    scoreB.focus();
    scoreB.select();
  });
  dialog.querySelectorAll('[data-quick-score-close]').forEach((button) => button.addEventListener('click', () => {
    quickScoreDraft = null;
    dialog.close();
  }));
  dialog.addEventListener('cancel', () => { quickScoreDraft = null; });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!quickScoreDraft || quickScoreDraft.submitting) return;
    syncDraft();
    let score;
    try {
      score = validateQuickScoreInput(scoreA.value, scoreB.value);
    } catch (error) {
      quickScoreDraft.error = error.message;
      errorNode.textContent = error.message;
      errorNode.hidden = false;
      updateQuickScoreSubmitLabel(dialog);
      return;
    }

    const { tournament, match } = quickScoreMatch(quickScoreDraft);
    if (!tournament || match?.status !== '可開始') {
      quickScoreDraft.error = '這場對局已被更新，請確認最新賽程。';
      errorNode.textContent = quickScoreDraft.error;
      errorNode.hidden = false;
      return;
    }

    const draft = { ...quickScoreDraft };
    const scrollPosition = { top: window.scrollY, left: window.scrollX };
    quickScoreDraft.submitting = true;
    quickScoreDraft.error = '';
    hydrateQuickScoreDialog(dialog);
    try {
      await executeTournamentAction(tournament.id, 'record_match', {
        roundIndex: draft.roundIndex,
        matchIndex: draft.matchIndex,
        scoreA: score.scoreA,
        scoreB: score.scoreB,
      }, { retryOnConflict: false });
      quickScoreDraft = null;
      scheduleScrollRestore = scrollPosition;
      render();
      showToast(`已登錄 ${match.playerA} ${score.scoreA}：${score.scoreB} ${match.playerB}`);
    } catch (error) {
      const latest = getState();
      const latestMatch = latest.tournaments.find((item) => item.id === draft.tournamentId)
        ?.rounds?.[draft.roundIndex]?.matches?.[draft.matchIndex];
      if (latestMatch?.status !== '可開始') {
        quickScoreDraft = null;
        scheduleScrollRestore = scrollPosition;
        render();
        showToast('這場對局已由其他裝置完成或變更，已載入最新賽果。', 'error');
        return;
      }
      quickScoreDraft = { ...draft, error: error.message || '同步失敗，請確認網路後重新送出。', submitting: false };
      render();
    }
  });

  if (state.isAdmin && readQuickScoreMode() && quickScoreDraft?.tournamentId === state.selectedTournamentId) {
    queueMicrotask(() => {
      if (!hydrateQuickScoreDialog(dialog)) {
        quickScoreDraft = null;
        return;
      }
      if (!dialog.open) dialog.showModal();
      focusQuickScoreInput(dialog);
    });
  }
}
'''
if helper_marker not in text:
    raise RuntimeError('expected bindScheduleEvents marker not found')
text = text.replace(helper_marker, helper + helper_marker, 1)
text = replace_once(
    text,
    '  bindTournamentListEvents();\n  prepareRosterUi(state.selectedTournamentId);\n',
    '  bindTournamentListEvents();\n  prepareRosterUi(state.selectedTournamentId);\n  bindQuickScoreDialog(state);\n',
    'bind quick score dialog',
)
text = replace_once(
    text,
    "  app.querySelectorAll('.match-card.is-ready').forEach((card) => card.addEventListener('click', () => {\n    scheduleScrollRestore = { top: window.scrollY, left: window.scrollX };\n    selectMatch(card.dataset.roundIndex, card.dataset.matchIndex);\n    render(true);\n  }));",
    "  app.querySelector('[data-action=\"toggle-quick-score\"]')?.addEventListener('click', () => {\n    const enabled = writeQuickScoreMode(!readQuickScoreMode());\n    if (!enabled) quickScoreDraft = null;\n    scheduleScrollRestore = { top: window.scrollY, left: window.scrollX };\n    render();\n    showToast(enabled ? '快速登分模式已開啟。' : '快速登分模式已關閉。');\n  });\n  app.querySelectorAll('.match-card.is-ready').forEach((card) => card.addEventListener('click', () => {\n    if (state.isAdmin && readQuickScoreMode()) {\n      openQuickScoreDialog(state, card);\n      return;\n    }\n    scheduleScrollRestore = { top: window.scrollY, left: window.scrollX };\n    selectMatch(card.dataset.roundIndex, card.dataset.matchIndex);\n    render(true);\n  }));",
    'quick score match click behavior',
)
path.write_text(text, encoding='utf-8')


# CSS: active mode cue and touch-friendly score entry sheet.
path = Path('src/styles/app.css')
text = path.read_text(encoding='utf-8')
css_marker = '/* 第一次使用者說明頁 */'
styles = r'''
/* 主控快速登分：模式只影響目前裝置的賽程互動，不改賽事資料。 */
.quick-score-toggle.is-active { background: #f2c94c18; color: #ffe785; border-color: #f2c94c88; box-shadow: 0 0 0 1px #f2c94c22 inset; }
.quick-score-notice { display: flex; align-items: center; gap: 12px; margin: -18px 0 24px; padding: 13px 16px; background: #f2c94c0d; border: 1px solid #f2c94c45; border-radius: 9px; }
.quick-score-notice b { color: #ffe785; font-size: 13px; white-space: nowrap; }
.quick-score-notice span { color: #aaa484; font-size: 12px; line-height: 1.55; }
.quick-score-active .match-card.is-ready { border-color: #f2c94c80; box-shadow: 0 0 0 1px #f2c94c14 inset, 0 9px 20px #0004; }
.quick-score-active .match-card.is-ready:hover { border-color: #f2c94c; box-shadow: 0 12px 25px #0006, 0 0 18px #f2c94c18; }
.quick-score-card { gap: 16px; }
.quick-score-context { display: flex; justify-content: space-between; gap: 12px; padding: 11px 13px; background: #090d13; border: 1px solid var(--line); border-radius: 8px; }
.quick-score-context span { min-width: 0; overflow: hidden; color: #aeb7c5; font-size: 12px; font-weight: 800; text-overflow: ellipsis; white-space: nowrap; }
.quick-score-context b { flex: 0 0 auto; color: #ffe785; font-size: 12px; }
.quick-score-grid { display: grid; grid-template-columns: minmax(0, 1fr) 34px minmax(0, 1fr); align-items: end; gap: 10px; }
.quick-score-grid label { min-width: 0; display: grid; gap: 8px; }
.quick-score-grid label > span { min-height: 42px; display: flex; align-items: flex-end; color: #e7ebf2; font-size: 14px; font-weight: 900; line-height: 1.35; }
.quick-score-grid input { width: 100%; min-width: 0; height: 82px; padding: 0 8px; background: #080b10; color: #fff; border: 1px solid #465266; border-radius: 10px; font: 900 42px/1 var(--font-display); text-align: center; font-variant-numeric: tabular-nums; }
.quick-score-grid input:focus { border-color: #f2c94c; box-shadow: 0 0 0 3px #f2c94c18; outline: 0; }
.quick-score-grid > i { padding-bottom: 20px; color: #758092; font: 900 32px/1 var(--font-display); font-style: normal; text-align: center; }
.quick-score-help { margin: -2px 0 0; color: var(--muted); font-size: 11px; line-height: 1.6; }
.quick-score-error { margin: 0; padding: 11px 13px; background: #ff493d13; color: #ffaaa4; border: 1px solid #ff493d48; border-radius: 8px; font-size: 12px; font-weight: 800; line-height: 1.55; }
.quick-score-error[hidden] { display: none !important; }
@media (max-width: 620px) {
  .quick-score-notice { align-items: flex-start; flex-direction: column; gap: 4px; margin-top: -20px; }
  .quick-score-notice b { white-space: normal; }
  .quick-score-grid { grid-template-columns: minmax(0, 1fr) 24px minmax(0, 1fr); gap: 6px; }
  .quick-score-grid label > span { min-height: 48px; font-size: 13px; }
  .quick-score-grid input { height: 76px; font-size: 38px; }
  .quick-score-grid > i { padding-bottom: 19px; font-size: 26px; }
}

'''
if css_marker not in text:
    raise RuntimeError('expected CSS marker not found')
text = text.replace(css_marker, styles + css_marker, 1)
path.write_text(text, encoding='utf-8')


# Full browser flow: verify no navigation, custom score, failed-send preservation, retry, persistence and switching back.
path = Path('tests/full-flow.test.js')
text = path.read_text(encoding='utf-8')
text = replace_once(text, 'const scrollCalls = [];\nlet assertions = 0;', 'const scrollCalls = [];\nlet failNextRecordMatch = false;\nlet assertions = 0;', 'browser failure flag')
text = replace_once(
    text,
    "  click('[data-action=\"back-bracket\"]');\n  await waitFor('.match-card.is-ready');\n\n  await completeReadyMatch(4, 2);\n  await forfeitReadyMatch();",
    "  click('[data-action=\"back-bracket\"]');\n  await waitFor('.match-card.is-ready');\n\n  expect(document.querySelector('[data-action=\"toggle-quick-score\"]'), '進行中的 Admin 賽程提供快速登分模式');\n  click('[data-action=\"toggle-quick-score\"]');\n  await waitUntil(() => document.querySelector('[data-action=\"toggle-quick-score\"]')?.getAttribute('aria-pressed') === 'true');\n  expectText('快速登分模式已開啟', '快速登分模式有清楚的賽程頁提示');\n  click('.match-card.is-ready');\n  await waitFor('[data-quick-score-dialog][open]');\n  expect(!document.querySelector('[data-scoreboard].match-mode'), '快速登分點對局不會跳到完整記分板');\n  fill('[data-quick-score-form] [name=\"scoreA\"]', '6');\n  fill('[data-quick-score-form] [name=\"scoreB\"]', '4');\n  failNextRecordMatch = true;\n  submit('[data-quick-score-form]');\n  await waitFor('[data-quick-score-dialog][open] [data-quick-score-error]:not([hidden])');\n  expect(document.querySelector('[data-quick-score-form] [name=\"scoreA\"]').value === '6' && document.querySelector('[data-quick-score-form] [name=\"scoreB\"]').value === '4', '快速登分同步失敗會保留尚未送出的比分');\n  submit('[data-quick-score-form]');\n  await waitFor('.match-card.is-ready');\n  expect(document.querySelector('[data-action=\"toggle-quick-score\"]')?.getAttribute('aria-pressed') === 'true', '成功登分後仍維持快速登分模式');\n  expect([...records.values()].some((item) => item.rounds?.some((round) => round.matches.some((match) => match.status === '已完成' && match.scoreA === 6 && match.scoreB === 4)), '快速登分可送出 6:4 等 overshoot 比分');\n  click('[data-action=\"toggle-quick-score\"]');\n  await waitUntil(() => document.querySelector('[data-action=\"toggle-quick-score\"]')?.getAttribute('aria-pressed') === 'false');\n  await forfeitReadyMatch();",
    'browser quick score flow',
)
text = replace_once(
    text,
    "    const { type, payload = {}, expectedRevision } = JSON.parse(options.body);\n    if (!current || current.revision !== expectedRevision) return json({ error: '資料衝突', tournament: current }, 409);",
    "    const { type, payload = {}, expectedRevision } = JSON.parse(options.body);\n    if (type === 'record_match' && failNextRecordMatch) {\n      failNextRecordMatch = false;\n      throw new Error('模擬快速登分同步失敗');\n    }\n    if (!current || current.revision !== expectedRevision) return json({ error: '資料衝突', tournament: current }, 409);",
    'browser mock quick score failure',
)
path.write_text(text, encoding='utf-8')

print('Quick score mode implementation applied')

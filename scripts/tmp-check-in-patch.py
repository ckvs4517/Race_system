from pathlib import Path
import re


def sub(path, pattern, replacement, flags=0):
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    next_text, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f'pattern count {count} in {path}: {pattern[:120]!r}')
    p.write_text(next_text, encoding='utf-8')


def rep(path, old, new):
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    if old not in text:
        raise SystemExit(f'pattern not found in {path}: {old[:120]!r}')
    p.write_text(text.replace(old, new, 1), encoding='utf-8')


# Domain: bulk check-in is one draft-roster mutation.
sub(
    'src/domain/tournament.js',
    r"(export function setDraftPlayerCheckedIn\(tournament, player, checkedIn\) \{.*?^\}\n)(\nexport function addDraftPlayer)",
    r"\1\nexport function setAllDraftPlayersCheckedIn(tournament) {\n  const normalized = normalizeTournament(tournament);\n  assertDraftRosterChange(normalized);\n  const participantStates = Object.fromEntries(normalized.players.map((player) => [\n    player,\n    { ...normalized.participantStates[player], status: 'active', checkedIn: true },\n  ]));\n  return rebuildDraftRoster(normalized, normalized.players, participantStates);\n}\n\2",
    re.S | re.M,
)

# Worker: official server-side action, one revision / one D1 write.
rep('worker/index.js', '  setDraftPlayerCheckedIn,\n', '  setDraftPlayerCheckedIn,\n  setAllDraftPlayersCheckedIn,\n')
rep(
    'worker/index.js',
    "    case 'set_check_in':\n      return setDraftPlayerCheckedIn(tournament, String(payload.player || ''), Boolean(payload.checkedIn));\n",
    "    case 'set_check_in':\n      return setDraftPlayerCheckedIn(tournament, String(payload.player || ''), Boolean(payload.checkedIn));\n    case 'set_all_check_in':\n      return setAllDraftPlayersCheckedIn(tournament);\n",
)

# Single-player check-in owns its small DOM update instead of rerendering the full schedule page.
rep(
    'src/data/store.js',
    "const EXPLICIT_RENDER_ACTIONS = new Set(['record_match', 'forfeit_match', 'replay_match']);",
    "const EXPLICIT_RENDER_ACTIONS = new Set(['record_match', 'forfeit_match', 'replay_match', 'set_check_in']);",
)

# View hooks + one-click bulk action.
rep(
    'src/views/schedule.js',
    '<div class="roster-tools-actions"><button type="button" class="button button-secondary" data-open-add-player>＋ 新增選手</button>',
    '<div class="roster-tools-actions"><button type="button" class="button button-secondary" data-check-in-all ${checkedInCount >= tournament.players.length && tournament.players.length ? \'disabled\' : \'\'}>全部報到</button><button type="button" class="button button-secondary" data-open-add-player>＋ 新增選手</button>',
)
rep('src/views/schedule.js', '<section class="check-in-panel">', '<section class="check-in-panel" data-check-in-minimum="${minimumPlayers}" data-check-in-total="${tournament.players.length}">')
rep('src/views/schedule.js', '<strong>已報到 ${checkedInCount}／報名 ${tournament.players.length} 人</strong>', '<strong data-check-in-summary>已報到 ${checkedInCount}／報名 ${tournament.players.length} 人</strong>')
rep('src/views/schedule.js', '<p class="check-in-guidance">${guidance}</p>', '<p class="check-in-guidance" data-check-in-guidance>${guidance}</p>')

# Client: serialize rapid check-ins to avoid revision conflicts and patch only local check-in DOM.
rep(
    'src/main.js',
    'let scheduleScrollRestore = null;\n',
    '''let scheduleScrollRestore = null;
let checkInSaveQueue = Promise.resolve();

function enqueueCheckInSave(task) {
  const pending = checkInSaveQueue.then(task, task);
  checkInSaveQueue = pending.catch(() => undefined);
  return pending;
}

function checkInInputFor(player) {
  return [...app.querySelectorAll('[data-check-in-player]')]
    .find((input) => input.dataset.checkInPlayer === player) || null;
}

function updateCheckInUi(player, checkedIn) {
  const panel = app.querySelector('.check-in-panel');
  if (!panel) return;
  const input = checkInInputFor(player);
  if (input) input.checked = checkedIn;
  const row = input?.closest('[data-roster-player]');
  if (row) {
    row.dataset.checkedIn = String(checkedIn);
    row.classList.toggle('is-checked-in', checkedIn);
    const status = row.querySelector('i');
    if (status) status.textContent = checkedIn ? '已報到' : '尚未報到';
  }
  const inputs = [...panel.querySelectorAll('[data-check-in-player]')];
  const checkedInCount = inputs.filter((candidate) => candidate.checked).length;
  const total = Number(panel.dataset.checkInTotal) || inputs.length;
  const minimumPlayers = Number(panel.dataset.checkInMinimum) || 2;
  const summary = panel.querySelector('[data-check-in-summary]');
  if (summary) summary.textContent = `已報到 ${checkedInCount}／報名 ${total} 人`;
  const guidance = panel.querySelector('[data-check-in-guidance]');
  if (guidance) guidance.textContent = checkedInCount >= minimumPlayers
    ? '已達開賽人數；未勾選者在開賽時會保留為未出席並排除賽程。'
    : `至少需要 ${minimumPlayers} 位選手完成報到才能開始賽事。`;
  const prepareButton = app.querySelector('[data-action="prepare-tournament-schedule"]');
  if (prepareButton) prepareButton.disabled = checkedInCount < minimumPlayers;
  const allButton = panel.querySelector('[data-check-in-all]');
  if (allButton) allButton.disabled = total > 0 && checkedInCount >= total;
  applyRosterUi();
}
''',
)

new_handler = '''  app.querySelector('[data-check-in-all]')?.addEventListener('click', (event) => {
    const button = event.currentTarget;
    const inputs = [...app.querySelectorAll('[data-check-in-player]')];
    if (!inputs.length) return;
    inputs.forEach((input) => updateCheckInUi(input.dataset.checkInPlayer, true));
    button.disabled = true;
    button.textContent = '報到處理中…';
    enqueueCheckInSave(async () => {
      try {
        await executeTournamentAction(state.selectedTournamentId, 'set_all_check_in');
        showToast(`已完成 ${inputs.length} 位選手報到。`);
      } catch (error) {
        showToast(error.message, 'error');
        render();
      }
    });
  });
  app.querySelectorAll('[data-check-in-player]').forEach((input) => input.addEventListener('change', () => {
    const player = input.dataset.checkInPlayer;
    const checkedIn = input.checked;
    updateCheckInUi(player, checkedIn);
    input.disabled = true;
    enqueueCheckInSave(async () => {
      try {
        await executeTournamentAction(state.selectedTournamentId, 'set_check_in', { player, checkedIn });
        updateCheckInUi(player, checkedIn);
        const currentInput = checkInInputFor(player);
        if (currentInput) currentInput.disabled = false;
        showToast(`${player}${checkedIn ? ' 已報到' : ' 已取消報到'}。`);
      } catch (error) {
        updateCheckInUi(player, !checkedIn);
        const currentInput = checkInInputFor(player);
        if (currentInput) currentInput.disabled = false;
        showToast(error.message, 'error');
      }
    });
  }));
'''
sub(
    'src/main.js',
    r"  app\.querySelectorAll\('\[data-check-in-player\]'\)\.forEach\(\(input\) => input\.addEventListener\('change', async \(\) => \{.*?^  \}\)\);\n",
    new_handler,
    re.S | re.M,
)

# Regression coverage.
rep('tests/check-in.test.mjs', "import assert from 'node:assert/strict';\n", "import assert from 'node:assert/strict';\nimport { readFileSync } from 'node:fs';\n")
rep('tests/check-in.test.mjs', '  setDraftPlayerCheckedIn,\n', '  setDraftPlayerCheckedIn,\n  setAllDraftPlayersCheckedIn,\n')
rep('tests/check-in.test.mjs', 'assert.match(view, /data-enter-remove-mode/);\n', "assert.match(view, /data-enter-remove-mode/);\nassert.match(view, /data-check-in-all/, '報到工具提供一鍵全部報到');\nassert.match(view, /data-check-in-summary/, '報到摘要可局部更新而不必重畫整頁');\n")
rep('tests/check-in.test.mjs', "for (const player of ['甲', '乙', '丙', '丁']) tournament = setDraftPlayerCheckedIn(tournament, player, true);", "tournament = setAllDraftPlayersCheckedIn(tournament);\nassert.ok(tournament.players.every((player) => tournament.participantStates[player].checkedIn), '一鍵報到會將草稿名單全部標為已報到');")
rep(
    'tests/check-in.test.mjs',
    "assert.throws(() => setDraftPlayerCheckedIn(started, '甲', false), /開始後/);\n\nconsole.log('PASS check-in flow');",
    "assert.throws(() => setDraftPlayerCheckedIn(started, '甲', false), /開始後/);\nassert.throws(() => setAllDraftPlayersCheckedIn(started), /開始後/);\n\nconst storeSource = readFileSync(new URL('../src/data/store.js', import.meta.url), 'utf8');\nconst mainSource = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');\nassert.match(storeSource, /EXPLICIT_RENDER_ACTIONS[^;]*set_check_in/s, '單人報到成功不觸發整個 schedule 頁重畫');\nassert.match(mainSource, /checkInSaveQueue/, '快速連續報到會序列化送出，避免 revision 衝突');\n\nconsole.log('PASS check-in flow');",
)

rep(
    'tests/api.test.mjs',
    "assert(largeCreatedResponse.status === 201 && largeCreated.tournament.players.length === MAX_TOURNAMENT_PLAYERS, '後端允許建立 48 人大型賽事');\n",
    "assert(largeCreatedResponse.status === 201 && largeCreated.tournament.players.length === MAX_TOURNAMENT_PLAYERS, '後端允許建立 48 人大型賽事');\nconst largeCheckInResponse = await request('/api/tournaments/48/actions', {\n  method: 'POST',\n  headers: authorizedHeaders,\n  body: JSON.stringify({ type: 'set_all_check_in', payload: {}, expectedRevision: 1 }),\n});\nconst largeCheckedIn = (await largeCheckInResponse.json()).tournament;\nassert(largeCheckInResponse.status === 200\n  && largeCheckedIn.revision === 2\n  && largeCheckedIn.players.every((player) => largeCheckedIn.participantStates[player].checkedIn), '48 人一鍵報到只寫入一個新版本');\n",
)

print('Applied check-in performance patch')

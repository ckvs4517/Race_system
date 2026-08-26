from pathlib import Path
import re


def replace_once(path, old, new):
    file = Path(path)
    text = file.read_text(encoding='utf-8')
    if old not in text:
        raise RuntimeError(f'Expected block not found in {path}: {old[:120]!r}')
    file.write_text(text.replace(old, new, 1), encoding='utf-8')


def replace_regex(path, pattern, replacement):
    file = Path(path)
    text = file.read_text(encoding='utf-8')
    next_text, count = re.subn(pattern, lambda _m: replacement, text, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError(f'Expected regex block not found exactly once in {path}: {pattern[:120]!r}; count={count}')
    file.write_text(next_text, encoding='utf-8')


# 1. Draft setup only decides ranking rule + Top 4 / Top 8. Stage 2 format is chosen later.
manage = 'src/views/manage.js'
replace_once(
    manage,
    '''          <div class="field-grid">
            <label class="field"><span>第二階段晉級人數</span><select name="swissAdvanceCount"><option value="4" ${swissStage2.advanceCount === 4 ? 'selected' : ''}>Top 4</option><option value="8" ${swissStage2.advanceCount === 8 ? 'selected' : ''}>Top 8</option></select><small>第一階段固定打 4 輪瑞士輪，再依排名進入第二階段。</small></label>
            <label class="field"><span>第二階段賽制</span><select name="swissStage2Format"><option value="single_elimination" ${swissStage2.format === 'single_elimination' ? 'selected' : ''}>單淘汰</option><option value="swiss" ${swissStage2.format === 'swiss' ? 'selected' : ''}>瑞士輪</option></select><small>規則在開賽前鎖定，第一階段完成後只執行既定設定。</small></label>
          </div>
          <label class="field" data-swiss-stage2-rounds ${swissStage2.format === 'swiss' ? '' : 'hidden'}><span>第二階段瑞士輪輪數</span><input name="swissStage2Rounds" type="number" inputmode="numeric" min="1" max="8" step="1" value="${swissStage2.rounds}" required><small>8/30 賽事使用 4 輪；第二階段積分與配對歷史會重新計算。</small></label>
''',
    '''          <label class="field"><span>第二階段晉級人數</span><select name="swissAdvanceCount"><option value="4" ${swissStage2.advanceCount === 4 ? 'selected' : ''}>Top 4</option><option value="8" ${swissStage2.advanceCount === 8 ? 'selected' : ''}>Top 8</option></select><small>第一階段固定打 4 輪瑞士輪；第二階段實際賽制會在第一階段完成後再選擇。</small></label>
'''
)
replace_once(
    manage,
    '''  const syncSwissStage2Fields = () => {
    const panel = root.querySelector('[data-swiss-stage2-settings]');
    const roundsField = root.querySelector('[data-swiss-stage2-rounds]');
    if (panel) panel.hidden = form.elements.format.value !== 'swiss';
    if (roundsField) roundsField.hidden = form.elements.swissStage2Format?.value !== 'swiss';
  };
  players.addEventListener('input', () => { count.textContent = `目前 ${getPlayers().length} 位參賽者`; });
  form.elements.format.addEventListener('change', syncSwissStage2Fields);
  form.elements.swissStage2Format?.addEventListener('change', syncSwissStage2Fields);
  syncSwissStage2Fields();
''',
    '''  const syncSwissStage2Fields = () => {
    const panel = root.querySelector('[data-swiss-stage2-settings]');
    if (panel) panel.hidden = form.elements.format.value !== 'swiss';
  };
  players.addEventListener('input', () => { count.textContent = `目前 ${getPlayers().length} 位參賽者`; });
  form.elements.format.addEventListener('change', syncSwissStage2Fields);
  syncSwissStage2Fields();
'''
)
replace_regex(
    manage,
    r'''function normalizeSwissStage2Config\(value = \{\}\) \{.*?\n\}\n\nfunction applySwissStage2Config\(tournament, form\) \{.*?\n\}''',
    '''function normalizeSwissStage2Config(value = {}) {
  return { advanceCount: Number(value?.advanceCount) === 8 ? 8 : 4 };
}

function applySwissStage2Config(tournament, form) {
  const next = { ...tournament };
  delete next.swissStage2Config;
  if (next.format !== 'swiss') return next;
  next.swissStage2Config = normalizeSwissStage2Config({
    advanceCount: form.elements.swissAdvanceCount?.value,
  });
  return next;
}'''
)
replace_once(
    manage,
    '<p><b>瑞士制</b>：固定四輪預賽；可直接以積分榜結束，或先確認四強後選擇循環決賽／單淘汰決賽。資格線同分時也可先建立資格積分決定賽。</p>',
    '<p><b>瑞士制</b>：固定四輪預賽並先設定 Top 4／Top 8 晉級人數；第一階段完成後再選擇第二階段賽制。Top 4 可用循環／單淘汰，Top 8 另可使用瑞士輪。</p>'
)

# 2. Stage 2 domain: choose the actual mode only when Stage 1 is complete.
swiss = 'src/formats/swiss.js'
replace_regex(
    swiss,
    r'''  startFinal\(tournament, finalists, mode = 'round_robin'\) \{.*?\n  \},\n\n  completeByStandings''',
    '''  startFinal(tournament, finalists, mode = 'round_robin', rounds = 4) {
    if (tournament.swissStage !== 'qualification') throw new Error('目前不能確認第二階段名單。');
    const configured = Boolean(tournament.swissStage2Config);
    const config = normalizeSwissStage2Config(tournament.swissStage2Config);
    const advanceCount = configured ? config.advanceCount : 4;
    const unique = validateSelection(finalists, tournament.players, advanceCount, advanceCount, configured ? `Top ${advanceCount}` : '四強');
    const selectedMode = String(mode || 'round_robin');
    const allowedModes = configured && advanceCount === 8
      ? ['round_robin', 'single_elimination', 'swiss']
      : ['round_robin', 'single_elimination'];
    if (!allowedModes.includes(selectedMode)) throw new Error('請選擇有效的第二階段賽制。');
    const selectedRounds = selectedMode === 'swiss'
      ? Math.min(8, Math.max(1, Number(rounds) || 4))
      : 4;
    const roundRobinLabel = configured ? `Top ${advanceCount} 第二階段循環賽` : '四強循環決賽';
    const finalRounds = selectedMode === 'round_robin'
      ? createRoundRobinRounds(unique, 'final', 'final', roundRobinLabel)
      : selectedMode === 'single_elimination'
        ? [createSingleEliminationOpening(unique)]
        : [createSwissRound(unique, 1, new Set(), null, {
          phase: 'final',
          seriesId: 'stage2-swiss',
          label: '第二階段瑞士輪',
          idPrefix: 'swiss-stage2',
        })];
    return {
      ...tournament,
      ...(configured ? { swissStage2Config: { advanceCount, format: selectedMode, rounds: selectedRounds } } : {}),
      rounds: [...tournament.rounds, ...finalRounds],
      finalists: unique,
      swissStage: 'final',
      swissFinalMode: selectedMode,
      champion: null,
      finalTie: false,
      finalTieBreakCount: 0,
      swissPlacementSeriesCount: 0,
      swissPlacementLockedChampion: null,
      activePlacementSeriesId: null,
      swissFinalTopTwo: [],
      updatedAt: new Date().toISOString(),
    };
  },

  completeByStandings'''
)
replace_once(
    swiss,
    '''function normalizeSwissStage2Config(value = {}) {
  return {
    advanceCount: Number(value?.advanceCount) === 8 ? 8 : 4,
    format: value?.format === 'swiss' ? 'swiss' : 'single_elimination',
    rounds: Math.min(8, Math.max(1, Number(value?.rounds) || 4)),
  };
}''',
    '''function normalizeSwissStage2Config(value = {}) {
  return {
    advanceCount: Number(value?.advanceCount) === 8 ? 8 : 4,
    format: value?.format === 'swiss' ? 'swiss' : value?.format === 'round_robin' ? 'round_robin' : 'single_elimination',
    rounds: Math.min(8, Math.max(1, Number(value?.rounds) || 4)),
  };
}'''
)

# 3. Pass the Stage 2 rounds decision through domain/API boundaries.
replace_once(
    'src/domain/tournament.js',
    '''export function startSwissFinal(tournament, finalists, mode = 'round_robin') {
  const normalized = normalizeTournament(tournament);
  const format = getTournamentFormat(normalized.format);
  if (format.id !== 'swiss' || !format.startFinal) throw new Error('這場賽事不支援四強循環決賽。');
  return format.startFinal(normalized, finalists, mode);
}''',
    '''export function startSwissFinal(tournament, finalists, mode = 'round_robin', rounds = 4) {
  const normalized = normalizeTournament(tournament);
  const format = getTournamentFormat(normalized.format);
  if (format.id !== 'swiss' || !format.startFinal) throw new Error('這場賽事不支援第二階段。');
  return format.startFinal(normalized, finalists, mode, rounds);
}'''
)
replace_once(
    'worker/index.js',
    '''    case 'start_swiss_final':
      return startSwissFinal(tournament, Array.isArray(payload.players) ? payload.players.map(String) : [], String(payload.mode || 'round_robin'));''',
    '''    case 'start_swiss_final':
      return startSwissFinal(
        tournament,
        Array.isArray(payload.players) ? payload.players.map(String) : [],
        String(payload.mode || 'round_robin'),
        Number(payload.rounds) || 4,
      );'''
)

# 4. UI: Stage 2 options appear only after Stage 1. Keep non-advancers in a collapsed leaderboard.
schedule = 'src/views/schedule.js'
replace_once(
    schedule,
    '''function readSwissStage2Config(tournament) {
  if (!tournament?.swissStage2Config) return null;
  return {
    advanceCount: Number(tournament.swissStage2Config.advanceCount) === 8 ? 8 : 4,
    format: tournament.swissStage2Config.format === 'swiss' ? 'swiss' : 'single_elimination',
    rounds: Math.min(8, Math.max(1, Number(tournament.swissStage2Config.rounds) || 4)),
  };
}''',
    '''function readSwissStage2Config(tournament) {
  if (!tournament?.swissStage2Config) return null;
  return {
    advanceCount: Number(tournament.swissStage2Config.advanceCount) === 8 ? 8 : 4,
    format: tournament.swissStage2Config.format === 'swiss'
      ? 'swiss'
      : tournament.swissStage2Config.format === 'round_robin'
        ? 'round_robin'
        : 'single_elimination',
    rounds: Math.min(8, Math.max(1, Number(tournament.swissStage2Config.rounds) || 4)),
  };
}'''
)
replace_regex(
    schedule,
    r'''function configuredSwissDecisionPanel\(tournament, canManage, config\) \{.*?\n\}\n\nfunction swissRoundArenaCount''',
    '''function configuredSwissDecisionPanel(tournament, canManage, config) {
  const stage = tournament.swissStage || 'preliminary';
  if (stage === 'preliminary') return '';
  if (stage === 'qualifier') {
    const qualifierRows = getSwissPhaseStandings(tournament, 'qualifier');
    return `<section class="swiss-decision-panel"><p class="kicker">QUALIFIER</p><h2>第二階段資格加賽進行中</h2><p>只處理跨越 Top ${config.advanceCount} 晉級切線的同分選手；完成後系統會重新檢查剩餘名額。</p>${swissMiniStandings(qualifierRows)}</section>`;
  }
  if (stage === 'final') {
    const activePlacement = [...(tournament.rounds || [])].reverse().find((round) => round.phase === 'placement'
      && round.matches.some((match) => ['可開始', '等待前輪'].includes(match.status)));
    const displayPlayers = activePlacement?.seriesPlayers || tournament.finalists || [];
    const isSwiss = tournament.swissFinalMode === 'swiss';
    const isRoundRobin = tournament.swissFinalMode === 'round_robin';
    const title = activePlacement
      ? '冠亞名次加賽進行中'
      : isSwiss
        ? `Top ${config.advanceCount} 第二階段瑞士輪`
        : isRoundRobin
          ? `Top ${config.advanceCount} 第二階段循環賽`
          : `Top ${config.advanceCount} 第二階段單淘汰`;
    const description = activePlacement
      ? '第二階段完成後冠亞關鍵名次仍完全同分；加賽只決定冠亞位置，不回寫第二階段原始積分。'
      : isSwiss
        ? `${config.advanceCount} 位晉級者積分歸零重新開始，共打 ${config.rounds} 輪；第一階段配對歷史不帶入第二階段。`
        : isRoundRobin
          ? `${config.advanceCount} 位晉級者每人互打一場，共 ${config.advanceCount - 1} 輪、${config.advanceCount * (config.advanceCount - 1) / 2} 場。`
          : `依第一階段排名種子進行 Top ${config.advanceCount} 單淘汰，直到產生冠軍。`;
    return `<section class="swiss-decision-panel"><p class="kicker">STAGE 2</p><h2>${title}</h2><p>${description}</p><div class="swiss-finalists">${displayPlayers.map((player) => `<span>${escapeText(player)}</span>`).join('')}</div></section>`;
  }
  if (stage === 'completed') return '';

  const rows = getTournamentStandings(tournament);
  const latestQualifier = tournament.qualifierSeriesCount ? getSwissPhaseStandings(tournament, 'qualifier') : [];
  const resolution = configuredAdvanceResolution(tournament, rows, latestQualifier, config.advanceCount);
  if (!canManage) {
    return `<section class="swiss-decision-panel"><p class="kicker">STAGE 1 COMPLETE</p><h2>第一階段已完成</h2><p>${resolution.needsQualifier ? `Top ${config.advanceCount} 晉級切線仍有同分，等待資格加賽。` : `Top ${config.advanceCount} 名單已確認，等待主辦方選擇並建立第二階段。`}</p></section>`;
  }
  if (resolution.needsQualifier) {
    const choices = swissPlayerChoices(resolution.qualifierCandidates, 'candidate', true);
    return `<section class="swiss-decision-panel"><p class="kicker">STAGE 1 COMPLETE</p><h2>Top ${config.advanceCount} 資格線需要加賽</h2><p>系統只挑出跨越晉級切線且目前完全同分的選手；其他已確定晉級或淘汰者不需要加賽。</p>${latestQualifier.length ? `<div class="swiss-latest-qualifier"><h3>最近一組資格加賽結果</h3>${swissMiniStandings(latestQualifier)}</div>` : ''}<form data-swiss-qualifier-form><h3>資格加賽選手</h3><div class="swiss-player-choices">${choices}</div><button class="button button-primary" type="submit">建立資格加賽</button></form></section>`;
  }
  const finalChoices = swissPlayerChoices(resolution.advancers, 'finalist', true);
  return `<section class="swiss-decision-panel"><p class="kicker">STAGE 1 COMPLETE</p><h2>確認 Top ${config.advanceCount} 並建立第二階段</h2><p>第一階段結果與排名會保留；請現在選擇第二階段賽制，建立後即鎖定。</p>${latestQualifier.length ? `<div class="swiss-latest-qualifier"><h3>資格加賽結果</h3>${swissMiniStandings(latestQualifier)}</div>` : ''}<form data-swiss-final-form><div class="swiss-player-choices">${finalChoices}</div>${stage2ModeOptions(config.advanceCount)}<button class="button button-primary" type="submit">建立第二階段</button></form></section>`;
}

function stage2ModeOptions(advanceCount) {
  const roundRobinMatches = advanceCount * (advanceCount - 1) / 2;
  const defaultMode = advanceCount === 8 ? 'swiss' : 'round_robin';
  return `<fieldset class="swiss-final-mode-options"><legend>第二階段賽制</legend><label><input type="radio" name="swissFinalMode" value="round_robin" ${defaultMode === 'round_robin' ? 'checked' : ''}><span><b>循環賽</b><small>${advanceCount} 人完整互打，共 ${advanceCount - 1} 輪、${roundRobinMatches} 場。</small></span></label><label><input type="radio" name="swissFinalMode" value="single_elimination"><span><b>單淘汰</b><small>依第一階段排名建立淘汰賽程。</small></span></label>${advanceCount === 8 ? `<label><input type="radio" name="swissFinalMode" value="swiss" checked><span><b>瑞士輪</b><small>第二階段成績與配對歷史歸零重新開始。</small></span></label>` : ''}</fieldset>${advanceCount === 8 ? '<label class="field stage2-rounds-field" data-stage2-rounds><span>第二階段瑞士輪輪數</span><input name="swissStage2Rounds" type="number" inputmode="numeric" min="1" max="8" step="1" value="4" required><small>建議 4 輪；只有選擇瑞士輪時使用。</small></label>' : ''}`;
}

function swissRoundArenaCount'''
)
replace_regex(
    schedule,
    r'''function swissStageGuide\(tournament\) \{.*?\n\}\n\nfunction swissChampionLabel''',
    '''function swissStageGuide(tournament) {
  const config = readSwissStage2Config(tournament);
  if (config) {
    const stage2Label = tournament.swissFinalMode === 'swiss'
      ? '第二階段瑞士輪'
      : tournament.swissFinalMode === 'round_robin'
        ? '第二階段循環賽'
        : '第二階段單淘汰';
    return {
      preliminary: `完成第四輪後確認 Top ${config.advanceCount} 晉級資格`,
      qualification: `第一階段完成，等待確認 Top ${config.advanceCount}、處理資格加賽並選擇第二階段賽制`,
      qualifier: `Top ${config.advanceCount} 資格加賽進行中`,
      final: tournament.activePlacementSeriesId ? '冠亞名次加賽進行中' : `Top ${config.advanceCount} ${stage2Label}進行中`,
      completed: `${stage2Label}已完成`,
    }[tournament.swissStage || 'preliminary'];
  }
  return {
    preliminary: '完成第四輪後會暫停，由主辦方確認四強資格',
    qualification: '四輪預賽完成，等待主辦方確認四強或建立資格加賽',
    qualifier: '資格積分決定賽進行中',
    final: tournament.finalTie && tournament.swissFinalMode !== 'single_elimination' ? '四強同分自動加賽進行中' : tournament.swissFinalMode === 'single_elimination' ? '前四名單淘汰決賽進行中' : '前四名循環決賽進行中',
    completed: tournament.swissFinalMode === 'standings' ? '已以瑞士輪積分榜結束賽事' : tournament.swissFinalMode === 'single_elimination' ? '前四名單淘汰決賽已完成' : '前四名循環決賽已完成',
  }[tournament.swissStage || 'preliminary'];
}

function swissChampionLabel'''
)
replace_regex(
    schedule,
    r'''function swissChampionLabel\(tournament\) \{.*?\n\}\n\nfunction roundPhaseLabel''',
    '''function swissChampionLabel(tournament) {
  if (tournament.swissStage2Config) {
    if (tournament.swissFinalMode === 'swiss') return '第二階段瑞士輪第一名';
    if (tournament.swissFinalMode === 'round_robin') return '第二階段循環賽第一名';
    if (tournament.swissFinalMode === 'single_elimination') return '第二階段單淘汰冠軍';
  }
  if (tournament.swissFinalMode === 'single_elimination') return '四強單淘汰賽冠軍';
  if (tournament.swissFinalMode === 'standings') return '瑞士輪積分榜第一名';
  return '四強循環賽第一名';
}

function roundPhaseLabel'''
)
replace_regex(
    schedule,
    r'''function swissLiveLeaderboardRows\(tournament\) \{.*?\n\}\n\nfunction leaderboardView\(tournament, rows, isSwiss\) \{.*?\n\}\n\nfunction leaderboardDescription''',
    '''function swissLiveLeaderboardRows(tournament) {
  const stage = tournament.swissStage || 'preliminary';
  if (stage === 'preliminary') return getSwissPhaseStandings(tournament, 'preliminary');
  if (stage === 'qualifier') return getSwissPhaseStandings(tournament, 'qualifier');
  if (['final', 'completed'].includes(stage) && (tournament.finalists || []).length) {
    const finalistSet = new Set(tournament.finalists || []);
    return getTournamentStandings(tournament).filter((row) => finalistSet.has(row.player));
  }
  return getTournamentStandings(tournament);
}

function swissArchivedLeaderboardRows(tournament) {
  const stage = tournament.swissStage || 'preliminary';
  if (!['final', 'completed'].includes(stage) || !(tournament.finalists || []).length) return [];
  const finalistSet = new Set(tournament.finalists || []);
  return getTournamentStandings(tournament).filter((row) => !finalistSet.has(row.player));
}

function leaderboardView(tournament, rows, isSwiss) {
  const showOpponentWins = shouldShowSwissOpponentWins(tournament);
  const rowClass = showOpponentWins ? ' has-buchholz' : '';
  const opponentHeader = showOpponentWins ? '<span>對手勝場</span>' : '';
  const description = leaderboardDescription(tournament, isSwiss, showOpponentWins);
  const completed = tournament.status === '已完成';
  const archivedRows = isSwiss ? swissArchivedLeaderboardRows(tournament) : [];
  const archivedShowOpponentWins = isSwiss
    && normalizeSwissRankingRule(tournament.swissRankingRule) === SWISS_RANKING_RULE_BUCHHOLZ;
  const archivedRowClass = archivedShowOpponentWins ? ' has-buchholz' : '';
  const archivedOpponentHeader = archivedShowOpponentWins ? '<span>對手勝場</span>' : '';
  const downloadHint = completed || archivedRows.length ? '與下載戰績圖' : '';
  const activeTable = `<div class="leaderboard-table"><div class="leaderboard-row leaderboard-header${rowClass}"><span>名次</span><span>選手</span><span>勝</span><span>敗</span>${opponentHeader}<span>總得分</span></div>${rows.map((row) => leaderboardPlayerRow(tournament, row, completed, rows, showOpponentWins)).join('')}</div>`;
  const archive = archivedRows.length
    ? `<details class="leaderboard-archive"><summary><span>第一階段止步選手（${archivedRows.length}）</span><small>查看排名、完整戰績與戰績圖</small></summary><div class="leaderboard-table"><div class="leaderboard-row leaderboard-header${archivedRowClass}"><span>名次</span><span>選手</span><span>勝</span><span>敗</span>${archivedOpponentHeader}<span>總得分</span></div>${archivedRows.map((row) => leaderboardPlayerRow(tournament, row, true, archivedRows, archivedShowOpponentWins)).join('')}</div></details>`
    : '';
  return `<section class="leaderboard"><div class="leaderboard-heading"><div><p class="kicker">LIVE STANDINGS</p><h2>賽事排行榜</h2></div><span>${description}；點選選手可查看已完成對戰${downloadHint}</span></div>${activeTable}${archive}</section>`;
}

function leaderboardDescription'''
)
replace_once(
    schedule,
    '''  if (tournament.swissFinalMode === 'round_robin' && ['final', 'completed'].includes(tournament.swissStage)) {
    return '四強循環依勝場、敗場、總得分排序；兩人完全同分時比較直接對戰，三人以上同分會自動加賽';
  }''',
    '''  if (tournament.swissFinalMode === 'round_robin' && ['final', 'completed'].includes(tournament.swissStage)) {
    const advanceCount = readSwissStage2Config(tournament)?.advanceCount || tournament.finalists?.length || 4;
    return `Top ${advanceCount} 循環依勝場、敗場、總得分排序；兩人完全同分時比較直接對戰，三人以上同分會自動加賽`;
  }'''
)
replace_once(
    schedule,
    '''      stage2: '第二階段瑞士輪',
      final: '四強／決賽',''',
    '''      stage2: '第二階段瑞士輪',
      final: tournament.swissStage2Config ? '第二階段' : '四強／決賽','''
)

# 5. Main UI bindings send the selected Stage 2 mode + Swiss round count.
main = 'src/main.js'
replace_once(
    main,
    '''  app.querySelector('[data-swiss-final-form]')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const finalists = [...event.currentTarget.querySelectorAll('input[name="finalist"]:checked')].map((input) => input.value);
    const mode = event.currentTarget.querySelector('input[name="swissFinalMode"]:checked')?.value;
    const selectedTournament = state.tournaments.find((item) => item.id === state.selectedTournamentId);
    const configuredStage2 = selectedTournament?.swissStage2Config;
    const label = configuredStage2
      ? `第二階段${mode === 'single_elimination' ? '單淘汰賽' : '瑞士輪'}`
      : mode === 'single_elimination' ? '前四單淘汰決賽（含季軍賽）' : '前四循環決賽';
    if (!confirm(`確定由這 ${finalists.length} 位選手進入${label}嗎？`)) return;
    beginSwissFinal(state.selectedTournamentId, finalists, mode);
  });''',
    '''  const swissFinalForm = app.querySelector('[data-swiss-final-form]');
  const syncStage2RoundsField = () => {
    const roundsField = swissFinalForm?.querySelector('[data-stage2-rounds]');
    if (!roundsField) return;
    roundsField.hidden = swissFinalForm.querySelector('input[name="swissFinalMode"]:checked')?.value !== 'swiss';
  };
  swissFinalForm?.querySelectorAll('input[name="swissFinalMode"]').forEach((input) => input.addEventListener('change', syncStage2RoundsField));
  syncStage2RoundsField();
  swissFinalForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    const finalists = [...event.currentTarget.querySelectorAll('input[name="finalist"]:checked')].map((input) => input.value);
    const mode = event.currentTarget.querySelector('input[name="swissFinalMode"]:checked')?.value;
    const rounds = mode === 'swiss' ? Number(event.currentTarget.elements.swissStage2Rounds?.value) || 4 : 4;
    const selectedTournament = state.tournaments.find((item) => item.id === state.selectedTournamentId);
    const configuredStage2 = selectedTournament?.swissStage2Config;
    const modeLabel = mode === 'swiss' ? `瑞士輪 ${rounds} 輪` : mode === 'round_robin' ? '循環賽' : '單淘汰';
    const label = configuredStage2 ? `第二階段${modeLabel}` : mode === 'single_elimination' ? '前四單淘汰決賽（含季軍賽）' : '前四循環決賽';
    if (!confirm(`確定由這 ${finalists.length} 位選手進入${label}嗎？`)) return;
    beginSwissFinal(state.selectedTournamentId, finalists, mode, rounds);
  });'''
)
replace_once(
    main,
    '''async function beginSwissFinal(tournamentId, finalists, mode) {
  try {
    await executeTournamentAction(tournamentId, 'start_swiss_final', { players: finalists, mode });
  } catch (error) {
    alert(error.message);
  }
}''',
    '''async function beginSwissFinal(tournamentId, finalists, mode, rounds = 4) {
  try {
    await executeTournamentAction(tournamentId, 'start_swiss_final', { players: finalists, mode, rounds });
  } catch (error) {
    alert(error.message);
  }
}'''
)

# 6. Share-card labels should describe generic configured Stage 2, not always "Top 4".
replace_once(
    'src/domain/share-card.js',
    '''      stage2: '第二階段瑞士輪',
      final: '四強／決賽',''',
    '''      stage2: '第二階段瑞士輪',
      final: tournament.swissStage2Config ? '第二階段' : '四強／決賽','''
)
replace_once(
    'src/domain/share-card.js',
    '''  if (round.phase === 'final') return '四強循環決賽';''',
    '''  if (round.phase === 'final') return round.name || '四強循環決賽';'''
)

# 7. Lightweight styling for the collapsed first-stage standings.
css = Path('src/styles/app.css')
css_text = css.read_text(encoding='utf-8')
marker = '/* Stage 2 archived standings */'
if marker not in css_text:
    css_text += '''\n\n/* Stage 2 archived standings */
.leaderboard-archive { margin-top: 14px; border: 1px solid var(--line); border-radius: 12px; overflow: hidden; background: rgba(255,255,255,.015); }
.leaderboard-archive > summary { list-style: none; cursor: pointer; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 16px 20px; font-weight: 700; }
.leaderboard-archive > summary::-webkit-details-marker { display: none; }
.leaderboard-archive > summary span::before { content: '▶'; display: inline-block; margin-right: 10px; font-size: .78em; transition: transform .16s ease; }
.leaderboard-archive[open] > summary span::before { transform: rotate(90deg); }
.leaderboard-archive > summary small { color: var(--muted); font-weight: 500; }
.leaderboard-archive .leaderboard-table { border: 0; border-top: 1px solid var(--line); border-radius: 0; }
@media (max-width: 720px) { .leaderboard-archive > summary { align-items: flex-start; flex-direction: column; gap: 4px; padding: 14px 16px; } }
'''
    css.write_text(css_text, encoding='utf-8')

# 8. README now matches the actual Stage 2 decision timing.
replace_once(
    'README.md',
    '''- 四輪完成後可直接以積分榜結束，或確認前四名後選擇循環決賽／單淘汰決賽
- 第 4 名資格線出現多人同分時，可建立 2～6 人資格積分決定賽
- 循環決賽進行三輪、共六場；單淘汰則依第 1 對第 4、第 2 對第 3 進行，並安排季軍賽
- 兩種四強決賽固定使用一台戰鬥台''',
    '''- 建立賽事時先決定第二階段晉級 Top 4 或 Top 8；第二階段實際賽制在四輪完成、晉級名單確認後才選擇並鎖定
- Top 4 第二階段可選循環賽或單淘汰；Top 8 可選循環賽、單淘汰或重新開始一組瑞士輪
- 晉級資格線出現多人同分時，只針對跨越 Top 4／Top 8 切線的同分群建立資格加賽
- 進入第二階段後，未晉級選手仍保留在排行榜下方的第一階段止步區，可查看完整成績與戰績圖'''
)

# 9. Regression tests: delayed mode choice, Top 4/Top 8 option matrix, archived leaderboard/download.
test = 'tests/swiss.test.mjs'
replace_once(
    test,
    '''assert.match(manageView(), /name="swissAdvanceCount"/);
assert.match(manageView(), /name="swissStage2Format"/);
assert.match(manageView(), /name="swissStage2Rounds"/);''',
    '''assert.match(manageView(), /name="swissAdvanceCount"/);
assert.doesNotMatch(manageView(), /name="swissStage2Format"/, '建立賽事時不應先選第二階段賽制');
assert.doesNotMatch(manageView(), /name="swissStage2Rounds"/, '建立賽事時不應先選第二階段瑞士輪輪數');'''
)
replace_once(
    test,
    '''let top8Stage = {
  ...createTournament('48人流程縮小驗證', top8Players, 'swiss', 2),
  swissStage2Config: { advanceCount: 8, format: 'swiss', rounds: 4 },
};''',
    '''let top8Stage = {
  ...createTournament('48人流程縮小驗證', top8Players, 'swiss', 2),
  swissStage2Config: { advanceCount: 8 },
};'''
)
replace_once(
    test,
    '''assert.match(top8QualificationView, /確認 Top 8 並建立第二階段/);
assert.match(top8QualificationView, /value="swiss" checked hidden/);
top8Stage = startSwissFinal(top8Stage, top8Finalists, 'single_elimination');
assert.equal(top8Stage.swissFinalMode, 'swiss', '賽前設定應鎖定第二階段為瑞士輪');''',
    '''assert.match(top8QualificationView, /確認 Top 8 並建立第二階段/);
assert.match(top8QualificationView, /value="round_robin"/);
assert.match(top8QualificationView, /value="single_elimination"/);
assert.match(top8QualificationView, /value="swiss" checked/);
assert.match(top8QualificationView, /name="swissStage2Rounds"/);
top8Stage = startSwissFinal(top8Stage, top8Finalists, 'swiss', 4);
assert.equal(top8Stage.swissFinalMode, 'swiss', '第二階段應使用第一階段完成後選定的瑞士輪');
assert.deepEqual(top8Stage.swissStage2Config, { advanceCount: 8, format: 'swiss', rounds: 4 });'''
)
replace_once(
    test,
    '''assert.equal(top8Stage.finalists.length, 8);
assert.equal(top8Stage.rounds.at(-1).matches.length, 4);
assert.ok(getSwissPhaseStandings(top8Stage, 'final').every((row) => row.wins === 0 && row.totalPoints === 0), '第二階段統計應從零開始');''',
    '''assert.equal(top8Stage.finalists.length, 8);
assert.equal(top8Stage.rounds.at(-1).matches.length, 4);
const top8LiveView = scheduleView([top8Stage], top8Stage.id, true);
assert.match(top8LiveView, /第一階段止步選手（4）/);
assert.match(top8LiveView, /查看排名、完整戰績與戰績圖/);
assert.match(top8LiveView, /data-download-share-card=/, '第二階段進行中，未晉級選手仍可下載戰績圖');
assert.ok(getSwissPhaseStandings(top8Stage, 'final').every((row) => row.wins === 0 && row.totalPoints === 0), '第二階段統計應從零開始');'''
)
replace_once(
    test,
    '''const top8TieProbe = {
  ...createTournament('Top8切線同分', tenWayTiePlayers, 'swiss'),
  status: '進行中',
  swissStage: 'qualification',
  swissStage2Config: { advanceCount: 8, format: 'swiss', rounds: 4 },
};''',
    '''const top8TieProbe = {
  ...createTournament('Top8切線同分', tenWayTiePlayers, 'swiss'),
  status: '進行中',
  swissStage: 'qualification',
  swissStage2Config: { advanceCount: 8 },
};'''
)
replace_once(
    test,
    '''let top8Knockout = {
  ...createTournament('Top8單淘汰第二階段', top8Players, 'swiss'),
  status: '進行中',
  swissStage: 'qualification',
  swissStage2Config: { advanceCount: 8, format: 'single_elimination', rounds: 4 },
};
top8Knockout = startSwissFinal(top8Knockout, top8Players.slice(0, 8), 'swiss');
assert.equal(top8Knockout.swissFinalMode, 'single_elimination');''',
    '''let top8Knockout = {
  ...createTournament('Top8單淘汰第二階段', top8Players, 'swiss'),
  status: '進行中',
  swissStage: 'qualification',
  swissStage2Config: { advanceCount: 8 },
};
top8Knockout = startSwissFinal(top8Knockout, top8Players.slice(0, 8), 'single_elimination');
assert.equal(top8Knockout.swissFinalMode, 'single_elimination');
assert.equal(top8Knockout.swissStage2Config.format, 'single_elimination');'''
)
# Add option-matrix and Top 8 round-robin assertions before multi-arena regression.
insert_before = '''const multiArena = startTournament(checkInAll(createTournament('雙台瑞士賽', players, 'swiss', 2)));'''
addition = '''const top4ChoiceProbe = {
  ...createTournament('Top4第二階段選擇', players, 'swiss'),
  status: '進行中',
  swissStage: 'qualification',
  swissStage2Config: { advanceCount: 4 },
};
const top4ChoiceView = scheduleView([top4ChoiceProbe], top4ChoiceProbe.id, true);
assert.match(top4ChoiceView, /value="round_robin" checked/);
assert.match(top4ChoiceView, /value="single_elimination"/);
assert.doesNotMatch(top4ChoiceView, /value="swiss"/, 'Top4 第二階段不可選瑞士輪');

let top8RoundRobin = {
  ...createTournament('Top8循環第二階段', top8Players, 'swiss'),
  status: '進行中',
  swissStage: 'qualification',
  swissStage2Config: { advanceCount: 8 },
};
top8RoundRobin = startSwissFinal(top8RoundRobin, top8Players.slice(0, 8), 'round_robin');
assert.equal(top8RoundRobin.swissFinalMode, 'round_robin');
assert.equal(top8RoundRobin.rounds.filter((round) => round.phase === 'final').length, 7, 'Top8 循環應建立 7 輪');
assert.equal(top8RoundRobin.rounds.filter((round) => round.phase === 'final').flatMap((round) => round.matches).length, 28, 'Top8 循環應建立 28 場');

'''
replace_once(test, insert_before, addition + insert_before)

print('Stage 2 UX patch applied')

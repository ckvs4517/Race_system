from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding='utf-8')


def write(path, text):
    (ROOT / path).write_text(text, encoding='utf-8')


def replace_once(path, old, new):
    text = read(path)
    if old not in text:
        raise RuntimeError(f'pattern not found in {path}: {old[:120]!r}')
    write(path, text.replace(old, new, 1))


def replace_regex(path, pattern, replacement):
    text = read(path)
    next_text, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError(f'regex replacement count {count} in {path}: {pattern}')
    write(path, next_text)


# ---------------------------------------------------------------------------
# Draft tournament UI: configure the second Swiss stage before play starts.
# ---------------------------------------------------------------------------
replace_once(
    'src/views/manage.js',
    "  const selectedFormat = tournament?.format || 'single_elimination';\n  const formatOptions = listTournamentFormats().map((format) => `<option value=\"${format.id}\" ${format.id === selectedFormat ? 'selected' : ''}>${format.name}</option>`).join('');\n  const drinkSettings = normalizeDrinkSettings(tournament?.drinkSettings || createDefaultDrinkSettings(), createDefaultDrinkSettings());",
    "  const selectedFormat = tournament?.format || 'single_elimination';\n  const formatOptions = listTournamentFormats().map((format) => `<option value=\"${format.id}\" ${format.id === selectedFormat ? 'selected' : ''}>${format.name}</option>`).join('');\n  const swissStage2 = normalizeSwissStage2Config(tournament?.swissStage2Config);\n  const drinkSettings = normalizeDrinkSettings(tournament?.drinkSettings || createDefaultDrinkSettings(), createDefaultDrinkSettings());"
)

replace_once(
    'src/views/manage.js',
    "        <label class=\"field\"><span>比賽賽制</span><select name=\"format\">${formatOptions}</select></label>\n        <label class=\"field\"><span>戰鬥台數</span><input name=\"arenaCount\" type=\"number\" inputmode=\"numeric\" min=\"1\" max=\"8\" step=\"1\" value=\"${tournament?.arenaCount || 1}\" required><small>可設定 1 至 8 台；賽程會平均分配到各戰鬥台。</small></label>",
    """        <label class=\"field\"><span>比賽賽制</span><select name=\"format\">${formatOptions}</select></label>
        <div data-swiss-stage2-settings ${selectedFormat === 'swiss' ? '' : 'hidden'}>
          <div class=\"field-grid\">
            <label class=\"field\"><span>第二階段晉級人數</span><select name=\"swissAdvanceCount\"><option value=\"4\" ${swissStage2.advanceCount === 4 ? 'selected' : ''}>Top 4</option><option value=\"8\" ${swissStage2.advanceCount === 8 ? 'selected' : ''}>Top 8</option></select><small>第一階段固定打 4 輪瑞士輪，再依排名進入第二階段。</small></label>
            <label class=\"field\"><span>第二階段賽制</span><select name=\"swissStage2Format\"><option value=\"single_elimination\" ${swissStage2.format === 'single_elimination' ? 'selected' : ''}>單淘汰</option><option value=\"swiss\" ${swissStage2.format === 'swiss' ? 'selected' : ''}>瑞士輪</option></select><small>規則在開賽前鎖定，第一階段完成後只執行既定設定。</small></label>
          </div>
          <label class=\"field\" data-swiss-stage2-rounds ${swissStage2.format === 'swiss' ? '' : 'hidden'}><span>第二階段瑞士輪輪數</span><input name=\"swissStage2Rounds\" type=\"number\" inputmode=\"numeric\" min=\"1\" max=\"8\" step=\"1\" value=\"${swissStage2.rounds}\" required><small>8/30 賽事使用 4 輪；第二階段積分與配對歷史會重新計算。</small></label>
        </div>
        <label class=\"field\"><span>戰鬥台數</span><input name=\"arenaCount\" type=\"number\" inputmode=\"numeric\" min=\"1\" max=\"8\" step=\"1\" value=\"${tournament?.arenaCount || 1}\" required><small>可設定 1 至 8 台；賽程會平均分配到各戰鬥台。</small></label>"""
)

replace_once(
    'src/views/manage.js',
    "  const getPlayers = () => players.value.split('\\n').map((value) => value.trim()).filter(Boolean);\n  players.addEventListener('input', () => { count.textContent = `目前 ${getPlayers().length} 位參賽者`; });",
    """  const getPlayers = () => players.value.split('\\n').map((value) => value.trim()).filter(Boolean);
  const syncSwissStage2Fields = () => {
    const panel = root.querySelector('[data-swiss-stage2-settings]');
    const roundsField = root.querySelector('[data-swiss-stage2-rounds]');
    if (panel) panel.hidden = form.elements.format.value !== 'swiss';
    if (roundsField) roundsField.hidden = form.elements.swissStage2Format?.value !== 'swiss';
  };
  players.addEventListener('input', () => { count.textContent = `目前 ${getPlayers().length} 位參賽者`; });
  form.elements.format.addEventListener('change', syncSwissStage2Fields);
  form.elements.swissStage2Format?.addEventListener('change', syncSwissStage2Fields);
  syncSwissStage2Fields();"""
)

replace_once(
    'src/views/manage.js',
    """      const result = options.tournament
        ? updateDraftTournament(options.tournament, form.elements.name.value, playerList, form.elements.format.value, form.elements.arenaCount.value, eventInfo, drinkSettings)
        : createTournament(form.elements.name.value, playerList, form.elements.format.value, form.elements.arenaCount.value, eventInfo, drinkSettings);
      options.onSubmit(result);""",
    """      let result = options.tournament
        ? updateDraftTournament(options.tournament, form.elements.name.value, playerList, form.elements.format.value, form.elements.arenaCount.value, eventInfo, drinkSettings)
        : createTournament(form.elements.name.value, playerList, form.elements.format.value, form.elements.arenaCount.value, eventInfo, drinkSettings);
      result = applySwissStage2Config(result, form);
      options.onSubmit(result);"""
)

replace_once(
    'src/views/manage.js',
    "function uniqueId(prefix) {",
    """function normalizeSwissStage2Config(value = {}) {
  const advanceCount = Number(value?.advanceCount) === 8 ? 8 : 4;
  const format = value?.format === 'swiss' ? 'swiss' : 'single_elimination';
  const rounds = Math.min(8, Math.max(1, Number(value?.rounds) || 4));
  return { advanceCount, format, rounds };
}

function applySwissStage2Config(tournament, form) {
  const next = { ...tournament };
  delete next.swissStage2Config;
  if (next.format !== 'swiss') return next;
  next.swissStage2Config = normalizeSwissStage2Config({
    advanceCount: form.elements.swissAdvanceCount?.value,
    format: form.elements.swissStage2Format?.value,
    rounds: form.elements.swissStage2Rounds?.value,
  });
  return next;
}

function uniqueId(prefix) {"""
)


# ---------------------------------------------------------------------------
# Swiss format: configurable Top 4/Top 8 second stage, 4R Swiss reset, cutline
# qualifier tracking, and isolated top-two placement tie-breaks.
# ---------------------------------------------------------------------------
replace_once(
    'src/formats/swiss.js',
    "/** 四輪瑞士制策略：四輪預賽後可直接結算，或選擇四強循環／單淘汰。 */",
    "/** 四輪瑞士制策略：四輪預賽後可依賽前設定進入第二階段，並保留舊賽事流程相容性。 */"
)
replace_once(
    'src/formats/swiss.js',
    "  name: '瑞士制（四輪＋彈性結算）',",
    "  name: '瑞士制（四輪＋第二階段）',"
)
replace_once(
    'src/formats/swiss.js',
    """      swissFinalMode: null,
      finalTieBreakCount: 0,""",
    """      swissFinalMode: null,
      finalTieBreakCount: 0,
      swissQualifierAutomaticPlayers: [],
      swissQualifierLockedPlayers: [],
      swissQualifierSlots: 0,
      swissPlacementSeriesCount: 0,
      swissPlacementLockedChampion: null,
      activePlacementSeriesId: null,
      swissFinalTopTwo: [],"""
)

replace_once(
    'src/formats/swiss.js',
    """    const finalists = tournament.swissFinalMode === 'single_elimination'
      ? rankSingleEliminationFinalists(tournament, finalStats)
      : rankRoundRobinFinalists(tournament, finalStats, finalRounds);""",
    """    const finalists = tournament.swissFinalMode === 'single_elimination'
      ? rankSingleEliminationFinalists(tournament, finalStats)
      : tournament.swissFinalMode === 'swiss'
        ? rankSwissStageTwoFinalists(tournament)
        : rankRoundRobinFinalists(tournament, finalStats, finalRounds);"""
)

replace_once(
    'src/formats/swiss.js',
    """    const rounds = tournament.rounds.filter((round) => (round.phase || 'preliminary') === phase
      && (!qualifierSeriesId || round.seriesId === qualifierSeriesId));
    const stats = deriveStats(players, rounds);
    if (phase === 'final' && tournament.swissFinalMode !== 'single_elimination') {
      return rankRoundRobinFinalists(tournament, stats, rounds).map((row) => ({
        ...row,
        isChampion: tournament.champion === row.player,
        participantStatus: tournament.participantStates?.[row.player]?.status || 'active',
      }));
    }""",
    """    const rounds = tournament.rounds.filter((round) => (round.phase || 'preliminary') === phase
      && (!qualifierSeriesId || round.seriesId === qualifierSeriesId)
      && (phase !== 'final' || tournament.swissFinalMode !== 'swiss' || round.seriesId === 'stage2-swiss'));
    const stats = deriveStats(players, rounds);
    if (phase === 'qualifier') {
      return rankRoundRobinPlayers(tournament, players, stats, rounds).map((row) => ({
        ...row,
        isChampion: false,
        participantStatus: tournament.participantStates?.[row.player]?.status || 'active',
      }));
    }
    if (phase === 'final' && tournament.swissFinalMode === 'swiss') {
      return addRanks(rankByRecordAndPoints(players, stats, tournament), tournament, rankingKey);
    }
    if (phase === 'final' && tournament.swissFinalMode !== 'single_elimination') {
      return rankRoundRobinFinalists(tournament, stats, rounds).map((row) => ({
        ...row,
        isChampion: tournament.champion === row.player,
        participantStatus: tournament.participantStates?.[row.player]?.status || 'active',
      }));
    }"""
)

replace_once(
    'src/formats/swiss.js',
    """    const phaseRoundsBefore = rounds.filter((item, index) => index !== roundIndex && (item.phase || 'preliminary') === phase);""",
    """    const phaseRoundsBefore = rounds.filter((item, index) => index !== roundIndex
      && (item.phase || 'preliminary') === phase
      && (!['qualifier', 'placement'].includes(phase) || item.seriesId === round.seriesId));"""
)

replace_once(
    'src/formats/swiss.js',
    """    if (phase === 'qualifier') {
      return { rounds, champion: null, swissStage: 'qualification', activeQualifierSeriesId: null };
    }

    if (phase === 'final') {
      if (tournament.swissFinalMode === 'single_elimination') {
        const completedFinalRounds = rounds.filter((item) => item.phase === 'final');
        const semiFinal = completedFinalRounds.find((item) => item.phaseRound === 1);
        if (semiFinal && !completedFinalRounds.some((item) => item.phaseRound === 2)) {
          rounds.push(createSingleEliminationFinalRound(semiFinal));
          return { rounds, champion: null, swissStage: 'final' };
        }
        const championship = completedFinalRounds
          .flatMap((item) => item.matches)
          .find((item) => item.id === 'swiss-final-championship');
        return { rounds, champion: championship?.winner || null, swissStage: 'completed' };
      }
      const finalRounds = rounds.filter((item) => item.phase === 'final');""",
    """    if (phase === 'qualifier') {
      return { rounds, champion: null, swissStage: 'qualification', activeQualifierSeriesId: null };
    }

    if (phase === 'placement') {
      return resolvePlacementSeries(tournament, rounds, round);
    }

    if (phase === 'final') {
      if (tournament.swissFinalMode === 'single_elimination') {
        return advanceSingleEliminationFinal(tournament, rounds);
      }
      if (tournament.swissFinalMode === 'swiss') {
        const stage2Rounds = rounds.filter((item) => item.phase === 'final' && item.seriesId === 'stage2-swiss');
        const targetRounds = normalizeSwissStage2Config(tournament.swissStage2Config).rounds;
        if (stage2Rounds.length < targetRounds) {
          const stage2Stats = deriveStats(tournament.finalists, stage2Rounds);
          const activeFinalists = tournament.finalists.filter((player) => isPlayerActive(tournament, player));
          const history = pairingHistory(stage2Rounds);
          const orderedPlayers = rankByRecordAndPoints(activeFinalists, stage2Stats, tournament).map((row) => row.player);
          const nextRound = createSwissRound(orderedPlayers, stage2Rounds.length + 1, history, stage2Stats, {
            phase: 'final',
            seriesId: 'stage2-swiss',
            label: '第二階段瑞士輪',
            idPrefix: 'swiss-stage2',
          });
          applyBye(nextRound, stage2Stats);
          rounds.push(nextRound);
          return { rounds, champion: null, swissStage: 'final' };
        }
        const rankingTournament = { ...tournament, rounds };
        const finalRanking = rankSwissStageTwoBase(rankingTournament);
        return beginPlacementOrComplete(rankingTournament, rounds, finalRanking);
      }
      const finalRounds = rounds.filter((item) => item.phase === 'final');"""
)

replace_regex(
    'src/formats/swiss.js',
    r"  startQualifier\(tournament, candidates\) \{[\s\S]*?\n  \},\n\n  startFinal\(tournament, finalists, mode = 'round_robin'\) \{[\s\S]*?\n  \},\n\n  completeByStandings",
    """  startQualifier(tournament, candidates) {
    if (tournament.swissStage !== 'qualification') throw new Error('目前不能建立資格積分決定賽。');
    const unique = validateSelection(candidates, tournament.players, 2, tournament.players.length, '資格加賽');
    const seriesNumber = Number(tournament.qualifierSeriesCount || 0) + 1;
    const seriesId = `qualifier-${seriesNumber}`;
    const configuredState = tournament.swissStage2Config
      ? prepareConfiguredQualifierState(tournament, unique)
      : {};
    return {
      ...tournament,
      ...configuredState,
      rounds: [...tournament.rounds, ...createRoundRobinRounds(unique, 'qualifier', seriesId, `資格加賽 ${seriesNumber}`)],
      swissStage: 'qualifier',
      qualifierSeriesCount: seriesNumber,
      activeQualifierSeriesId: seriesId,
      updatedAt: new Date().toISOString(),
    };
  },

  startFinal(tournament, finalists, mode = 'round_robin') {
    if (tournament.swissStage !== 'qualification') throw new Error('目前不能確認第二階段名單。');
    const configured = Boolean(tournament.swissStage2Config);
    const config = normalizeSwissStage2Config(tournament.swissStage2Config);
    const advanceCount = configured ? config.advanceCount : 4;
    const unique = validateSelection(finalists, tournament.players, advanceCount, advanceCount, configured ? `Top ${advanceCount}` : '四強');
    const selectedMode = configured ? config.format : mode;
    const allowedModes = configured ? ['single_elimination', 'swiss'] : ['round_robin', 'single_elimination'];
    if (!allowedModes.includes(selectedMode)) throw new Error('請選擇有效的第二階段賽制。');
    const finalRounds = selectedMode === 'round_robin'
      ? createRoundRobinRounds(unique, 'final', 'final', '四強循環決賽')
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

  completeByStandings"""
)

replace_regex(
    'src/formats/swiss.js',
    r"function createSwissRound\(orderedPlayers, roundNumber, history, stats = null\) \{[\s\S]*?\n\}\n\nfunction findPairings",
    """function createSwissRound(orderedPlayers, roundNumber, history, stats = null, options = {}) {
  const players = [...orderedPlayers];
  let byePlayer = null;
  if (players.length % 2) {
    const reversed = [...players].reverse();
    byePlayer = reversed.find((player) => !(stats?.[player]?.byeCount)) || reversed[0];
    players.splice(players.indexOf(byePlayer), 1);
  }

  const pairs = findPairings(players, history, stats, false) || findPairings(players, history, stats, true) || [];
  if (byePlayer) pairs.push([byePlayer, BYE]);
  const phase = options.phase || 'preliminary';
  const seriesId = options.seriesId || 'preliminary';
  const label = options.label || '瑞士制';
  const idPrefix = options.idPrefix || 'swiss';

  return {
    name: phase === 'preliminary' ? `瑞士制第 ${roundNumber} 輪` : `${label}－第 ${roundNumber} 輪`,
    phase,
    phaseRound: roundNumber,
    seriesId,
    seriesPlayers: phase === 'preliminary' ? undefined : [...orderedPlayers],
    seedPlayer: byePlayer,
    seedReason: byePlayer ? 'swiss-bye' : null,
    matches: pairs.map(([playerA, playerB], index) => createMatch(`${idPrefix}-r${roundNumber}m${index + 1}`, playerA, playerB)),
  };
}

function findPairings"""
)

replace_regex(
    'src/formats/swiss.js',
    r"function createSingleEliminationSemiFinals\(finalists\) \{[\s\S]*?\n\}\n\nfunction createSingleEliminationFinalRound\(semiFinal\) \{[\s\S]*?\n\}\n\nfunction createMatch",
    """function createSingleEliminationOpening(finalists) {
  const pairIndexes = finalists.length === 8
    ? [[0, 7], [3, 4], [1, 6], [2, 5]]
    : [[0, 3], [1, 2]];
  return {
    name: finalists.length === 8 ? '第二階段單淘汰｜8 強賽' : '四強單淘汰｜準決賽',
    phase: 'final',
    phaseRound: 1,
    seriesId: 'final',
    seriesPlayers: [...finalists],
    matches: pairIndexes.map(([left, right], index) => createMatch(`swiss-final-r1m${index + 1}`, finalists[left], finalists[right])),
  };
}

function createSingleEliminationNextRound(previousRound) {
  const winners = previousRound.matches.map((match) => match.winner);
  if (previousRound.matches.length > 2) {
    return {
      name: '第二階段單淘汰｜準決賽',
      phase: 'final',
      phaseRound: previousRound.phaseRound + 1,
      seriesId: 'final',
      seriesPlayers: [...previousRound.seriesPlayers],
      matches: [
        createMatch(`swiss-final-r${previousRound.phaseRound + 1}m1`, winners[0], winners[1]),
        createMatch(`swiss-final-r${previousRound.phaseRound + 1}m2`, winners[2], winners[3]),
      ],
    };
  }
  const loserOf = (match) => match.winner === match.playerA ? match.playerB : match.playerA;
  return {
    name: '第二階段單淘汰｜冠軍賽與季軍賽',
    phase: 'final',
    phaseRound: previousRound.phaseRound + 1,
    seriesId: 'final',
    seriesPlayers: [...previousRound.seriesPlayers],
    matches: [
      createMatch('swiss-final-third-place', loserOf(previousRound.matches[0]), loserOf(previousRound.matches[1])),
      createMatch('swiss-final-championship', winners[0], winners[1]),
    ],
  };
}

function advanceSingleEliminationFinal(tournament, rounds) {
  const finalRounds = rounds.filter((item) => item.phase === 'final');
  const latest = finalRounds.at(-1);
  const championship = finalRounds.flatMap((item) => item.matches).find((item) => item.id === 'swiss-final-championship');
  if (championship?.winner) return { rounds, champion: championship.winner, swissStage: 'completed' };
  rounds.push(createSingleEliminationNextRound(latest));
  return { rounds, champion: null, swissStage: 'final' };
}

function createMatch"""
)

replace_once(
    'src/formats/swiss.js',
    """function rankRoundRobinFinalists(tournament, stats, rounds) {
  const ranked = rankByRecordAndPoints(tournament.finalists, stats, tournament);""",
    """function rankRoundRobinFinalists(tournament, stats, rounds) {
  return rankRoundRobinPlayers(tournament, tournament.finalists, stats, rounds);
}

function rankRoundRobinPlayers(tournament, players, stats, rounds) {
  const ranked = rankByRecordAndPoints(players, stats, tournament);"""
)

replace_regex(
    'src/formats/swiss.js',
    r"function rankSingleEliminationFinalists\(tournament, stats\) \{[\s\S]*?\n\}\n\n// 未報到者",
    """function rankSingleEliminationFinalists(tournament, stats) {
  const finalMatches = tournament.rounds
    .filter((round) => round.phase === 'final')
    .flatMap((round) => round.matches);
  const championship = finalMatches.find((match) => match.id === 'swiss-final-championship');
  const thirdPlace = finalMatches.find((match) => match.id === 'swiss-final-third-place');
  if (!championship?.winner || !thirdPlace?.winner) {
    return rankByRecordAndPoints(tournament.finalists, stats, tournament);
  }
  const loserOf = (match) => match.winner === match.playerA ? match.playerB : match.playerA;
  const topFour = [championship.winner, loserOf(championship), thirdPlace.winner, loserOf(thirdPlace)];
  const topSet = new Set(topFour);
  const remaining = tournament.finalists.filter((player) => !topSet.has(player));
  return [...topFour, ...remaining].map((player, index) => ({
    ...rowsFor([player], stats)[0],
    placementIndex: index,
  }))
    .sort((left, right) => participantRankingGroup(tournament, left.player) - participantRankingGroup(tournament, right.player)
      || left.placementIndex - right.placementIndex)
    .map(({ placementIndex, ...row }) => row);
}

function normalizeSwissStage2Config(value = {}) {
  return {
    advanceCount: Number(value?.advanceCount) === 8 ? 8 : 4,
    format: value?.format === 'swiss' ? 'swiss' : 'single_elimination',
    rounds: Math.min(8, Math.max(1, Number(value?.rounds) || 4)),
  };
}

function preliminaryRanking(tournament) {
  const preliminaryRounds = tournament.rounds.filter((round) => (round.phase || 'preliminary') === 'preliminary');
  const stats = deriveStats(tournament.players, preliminaryRounds);
  return addRanks(rankByRecordAndPoints(tournament.players, stats, tournament), tournament, rankingKey);
}

function advancementCut(rows, slots) {
  if (slots <= 0 || rows.length <= slots) return { needsTieBreak: false, automatic: rows.slice(0, slots), tied: [], openSlots: 0 };
  const cutoff = rows[slots - 1];
  const automatic = rows.filter((row) => row.rank < cutoff.rank);
  const tied = rows.filter((row) => row.rank === cutoff.rank);
  const openSlots = Math.max(0, slots - automatic.length);
  return { needsTieBreak: tied.length > openSlots, automatic, tied, openSlots };
}

function latestQualifierRows(tournament) {
  const latest = [...tournament.rounds].reverse().find((round) => round.phase === 'qualifier');
  if (!latest) return [];
  const rounds = tournament.rounds.filter((round) => round.phase === 'qualifier' && round.seriesId === latest.seriesId);
  const stats = deriveStats(latest.seriesPlayers || [], rounds);
  return rankRoundRobinPlayers(tournament, latest.seriesPlayers || [], stats, rounds);
}

function prepareConfiguredQualifierState(tournament, nextCandidates) {
  const config = normalizeSwissStage2Config(tournament.swissStage2Config);
  let automaticPlayers = [...(tournament.swissQualifierAutomaticPlayers || [])];
  let lockedPlayers = [...(tournament.swissQualifierLockedPlayers || [])];
  let slots = Number(tournament.swissQualifierSlots || 0);
  if (!tournament.qualifierSeriesCount || !slots) {
    const cut = advancementCut(preliminaryRanking(tournament), config.advanceCount);
    automaticPlayers = cut.automatic.map((row) => row.player);
    lockedPlayers = [];
    slots = cut.openSlots;
  } else {
    const previousRows = latestQualifierRows(tournament);
    const remainingSlots = Math.max(0, slots - lockedPlayers.length);
    const cut = advancementCut(previousRows, remainingSlots);
    const candidateSet = new Set(nextCandidates);
    cut.automatic.forEach((row) => {
      if (!candidateSet.has(row.player) && !lockedPlayers.includes(row.player)) lockedPlayers.push(row.player);
    });
  }
  return {
    swissQualifierAutomaticPlayers: automaticPlayers,
    swissQualifierLockedPlayers: lockedPlayers,
    swissQualifierSlots: slots,
  };
}

function stageTwoSwissRounds(tournament, rounds = tournament.rounds) {
  return rounds.filter((round) => round.phase === 'final' && round.seriesId === 'stage2-swiss');
}

function rankSwissStageTwoBase(tournament) {
  const rounds = stageTwoSwissRounds(tournament);
  const stats = deriveStats(tournament.finalists || [], rounds);
  return addRanks(rankByRecordAndPoints(tournament.finalists || [], stats, tournament), tournament, rankingKey);
}

function rankSwissStageTwoFinalists(tournament) {
  const base = rankSwissStageTwoBase(tournament);
  const topTwo = Array.isArray(tournament.swissFinalTopTwo) ? tournament.swissFinalTopTwo : [];
  if (topTwo.length < 2) return base;
  const rowByPlayer = new Map(base.map((row) => [row.player, row]));
  const topRows = topTwo.map((player, index) => ({
    ...(rowByPlayer.get(player) || rowsFor([player], {})[0]),
    rank: index + 1,
    isChampion: index === 0,
  }));
  const topSet = new Set(topTwo);
  const remaining = base.filter((row) => !topSet.has(row.player)).map((row, index) => ({ ...row, rank: index + 3, isChampion: false }));
  return [...topRows, ...remaining];
}

function topTwoTieState(ranking) {
  const firstGroup = ranking.filter((row) => row.rank === 1);
  if (firstGroup.length > 1) return { candidates: firstGroup.map((row) => row.player), lockedChampion: null };
  const second = ranking[1];
  if (!second) return null;
  const secondGroup = ranking.filter((row) => row.rank === second.rank);
  if (secondGroup.length > 1) return { candidates: secondGroup.map((row) => row.player), lockedChampion: ranking[0].player };
  return null;
}

function beginPlacementSeries(tournament, rounds, candidates, lockedChampion) {
  const seriesNumber = Number(tournament.swissPlacementSeriesCount || 0) + 1;
  const seriesId = `placement-${seriesNumber}`;
  return {
    rounds: [...rounds, ...createRoundRobinRounds(candidates, 'placement', seriesId, `冠亞名次加賽 ${seriesNumber}`)],
    champion: null,
    swissStage: 'final',
    swissPlacementSeriesCount: seriesNumber,
    swissPlacementLockedChampion: lockedChampion || null,
    activePlacementSeriesId: seriesId,
  };
}

function completeSwissStageTwo(rounds, topTwo) {
  return {
    rounds,
    champion: topTwo[0] || null,
    swissFinalTopTwo: topTwo,
    swissStage: 'completed',
    swissPlacementLockedChampion: null,
    activePlacementSeriesId: null,
  };
}

function beginPlacementOrComplete(tournament, rounds, ranking) {
  const tie = topTwoTieState(ranking);
  if (tie) return beginPlacementSeries(tournament, rounds, tie.candidates, tie.lockedChampion);
  return completeSwissStageTwo(rounds, ranking.slice(0, 2).map((row) => row.player));
}

function resolvePlacementSeries(tournament, rounds, completedRound) {
  const seriesId = completedRound.seriesId;
  const seriesRounds = rounds.filter((round) => round.phase === 'placement' && round.seriesId === seriesId);
  const players = completedRound.seriesPlayers || [];
  const stats = deriveStats(players, seriesRounds);
  const ranked = rankRoundRobinPlayers(tournament, players, stats, seriesRounds);
  const lockedChampion = tournament.swissPlacementLockedChampion || null;
  const firstGroup = ranked.filter((row) => row.rank === 1);
  if (firstGroup.length > 1) {
    return beginPlacementSeries(tournament, rounds, firstGroup.map((row) => row.player), lockedChampion);
  }
  if (lockedChampion) return completeSwissStageTwo(rounds, [lockedChampion, ranked[0].player]);
  const second = ranked[1];
  const secondGroup = ranked.filter((row) => row.rank === second?.rank);
  if (secondGroup.length > 1) {
    return beginPlacementSeries(tournament, rounds, secondGroup.map((row) => row.player), ranked[0].player);
  }
  return completeSwissStageTwo(rounds, ranked.slice(0, 2).map((row) => row.player));
}

// 未報到者"""
)


# ---------------------------------------------------------------------------
# Schedule UI: configured second-stage execution and only cutline tie-breaks.
# ---------------------------------------------------------------------------
replace_once(
    'src/views/schedule.js',
    "  const activeArenaCount = isSwiss && ['final', 'completed'].includes(tournament.swissStage) ? 1 : arenaCount;",
    "  const activeArenaCount = isSwiss && !tournament.swissStage2Config && ['final', 'completed'].includes(tournament.swissStage) ? 1 : arenaCount;"
)
replace_once(
    'src/views/schedule.js',
    "visibleRoundEntries.map(({ round, roundIndex }) => roundColumnView(tournament, round, roundIndex, canManage, isDraft || isScheduling, allSeedNames, isSwiss, round.phase === 'final' ? 1 : arenaCount)).join('')",
    "visibleRoundEntries.map(({ round, roundIndex }) => roundColumnView(tournament, round, roundIndex, canManage, isDraft || isScheduling, allSeedNames, isSwiss, swissRoundArenaCount(tournament, round, arenaCount))).join('')"
)
replace_once(
    'src/views/schedule.js',
    "function swissDecisionPanel(tournament, canManage) {\n  const stage = tournament.swissStage || 'preliminary';",
    "function swissDecisionPanel(tournament, canManage) {\n  const configuredStage2 = readSwissStage2Config(tournament);\n  if (configuredStage2) return configuredSwissDecisionPanel(tournament, canManage, configuredStage2);\n  const stage = tournament.swissStage || 'preliminary';"
)

replace_once(
    'src/views/schedule.js',
    "function roundRobinTieBreakPanel(tournament, canManage) {",
    """function readSwissStage2Config(tournament) {
  if (!tournament?.swissStage2Config) return null;
  return {
    advanceCount: Number(tournament.swissStage2Config.advanceCount) === 8 ? 8 : 4,
    format: tournament.swissStage2Config.format === 'swiss' ? 'swiss' : 'single_elimination',
    rounds: Math.min(8, Math.max(1, Number(tournament.swissStage2Config.rounds) || 4)),
  };
}

function advancementCutState(rows, slots) {
  if (slots <= 0 || rows.length <= slots) return { needsQualifier: false, automatic: rows.slice(0, slots), candidates: [], openSlots: 0 };
  const cutoff = rows[slots - 1];
  const automatic = rows.filter((row) => row.rank < cutoff.rank);
  const candidates = rows.filter((row) => row.rank === cutoff.rank);
  const openSlots = Math.max(0, slots - automatic.length);
  return { needsQualifier: candidates.length > openSlots, automatic, candidates, openSlots };
}

function configuredAdvanceResolution(tournament, preliminaryRows, latestQualifierRows, advanceCount) {
  if (!tournament.qualifierSeriesCount || !latestQualifierRows.length) {
    const cut = advancementCutState(preliminaryRows, advanceCount);
    return cut.needsQualifier
      ? { needsQualifier: true, qualifierCandidates: cut.candidates, advancers: [] }
      : { needsQualifier: false, qualifierCandidates: [], advancers: preliminaryRows.slice(0, advanceCount) };
  }
  const automaticNames = tournament.swissQualifierAutomaticPlayers || [];
  const lockedNames = tournament.swissQualifierLockedPlayers || [];
  const totalSlots = Number(tournament.swissQualifierSlots || 0);
  const remainingSlots = Math.max(0, totalSlots - lockedNames.length);
  const cut = advancementCutState(latestQualifierRows, remainingSlots);
  if (cut.needsQualifier) return { needsQualifier: true, qualifierCandidates: cut.candidates, advancers: [] };
  const winnerNames = latestQualifierRows.slice(0, remainingSlots).map((row) => row.player);
  const names = [...automaticNames, ...lockedNames, ...winnerNames].slice(0, advanceCount);
  const rowByPlayer = new Map([...preliminaryRows, ...latestQualifierRows].map((row) => [row.player, row]));
  return { needsQualifier: false, qualifierCandidates: [], advancers: names.map((player) => rowByPlayer.get(player)).filter(Boolean) };
}

function configuredSwissDecisionPanel(tournament, canManage, config) {
  const stage = tournament.swissStage || 'preliminary';
  if (stage === 'preliminary') return '';
  if (stage === 'qualifier') {
    const qualifierRows = getSwissPhaseStandings(tournament, 'qualifier');
    return `<section class=\"swiss-decision-panel\"><p class=\"kicker\">QUALIFIER</p><h2>第二階段資格加賽進行中</h2><p>只處理跨越 Top ${config.advanceCount} 晉級切線的同分選手；完成後系統會重新檢查剩餘名額。</p>${swissMiniStandings(qualifierRows)}</section>`;
  }
  if (stage === 'final') {
    const activePlacement = [...(tournament.rounds || [])].reverse().find((round) => round.phase === 'placement'
      && round.matches.some((match) => ['可開始', '等待前輪'].includes(match.status)));
    const displayPlayers = activePlacement?.seriesPlayers || tournament.finalists || [];
    const isSwiss = tournament.swissFinalMode === 'swiss';
    const title = activePlacement
      ? '冠亞名次加賽進行中'
      : isSwiss ? `Top ${config.advanceCount} 第二階段瑞士輪` : `Top ${config.advanceCount} 第二階段單淘汰`;
    const description = activePlacement
      ? '第二階段完成後冠亞關鍵名次仍完全同分；加賽只決定冠亞位置，不回寫第二階段原始積分。'
      : isSwiss
        ? `${config.advanceCount} 位晉級者積分歸零重新開始，共打 ${config.rounds} 輪；第一階段配對歷史不帶入第二階段。`
        : `依第一階段排名種子進行 Top ${config.advanceCount} 單淘汰，直到產生冠軍。`;
    return `<section class=\"swiss-decision-panel\"><p class=\"kicker\">STAGE 2</p><h2>${title}</h2><p>${description}</p><div class=\"swiss-finalists\">${displayPlayers.map((player) => `<span>${escapeText(player)}</span>`).join('')}</div></section>`;
  }
  if (stage === 'completed') return '';

  const rows = getTournamentStandings(tournament);
  const latestQualifier = tournament.qualifierSeriesCount ? getSwissPhaseStandings(tournament, 'qualifier') : [];
  const resolution = configuredAdvanceResolution(tournament, rows, latestQualifier, config.advanceCount);
  if (!canManage) {
    return `<section class=\"swiss-decision-panel\"><p class=\"kicker\">STAGE 1 COMPLETE</p><h2>第一階段已完成</h2><p>${resolution.needsQualifier ? `Top ${config.advanceCount} 晉級切線仍有同分，等待資格加賽。` : `Top ${config.advanceCount} 名單已確認，等待主辦方建立第二階段。`}</p></section>`;
  }
  if (resolution.needsQualifier) {
    const choices = swissPlayerChoices(resolution.qualifierCandidates, 'candidate', true);
    return `<section class=\"swiss-decision-panel\"><p class=\"kicker\">STAGE 1 COMPLETE</p><h2>Top ${config.advanceCount} 資格線需要加賽</h2><p>系統只挑出跨越晉級切線且目前完全同分的選手；其他已確定晉級或淘汰者不需要加賽。</p>${latestQualifier.length ? `<div class=\"swiss-latest-qualifier\"><h3>最近一組資格加賽結果</h3>${swissMiniStandings(latestQualifier)}</div>` : ''}<form data-swiss-qualifier-form><h3>資格加賽選手</h3><div class=\"swiss-player-choices\">${choices}</div><button class=\"button button-primary\" type=\"submit\">建立資格加賽</button></form></section>`;
  }
  const finalChoices = swissPlayerChoices(resolution.advancers, 'finalist', true);
  const formatLabel = config.format === 'swiss' ? `瑞士輪 ${config.rounds} 輪` : '單淘汰';
  return `<section class=\"swiss-decision-panel\"><p class=\"kicker\">STAGE 1 COMPLETE</p><h2>確認 Top ${config.advanceCount} 並建立第二階段</h2><p>賽前設定：Top ${config.advanceCount} → ${formatLabel}。第一階段結果保留為歷史紀錄，第二階段重新計算成績。</p>${latestQualifier.length ? `<div class=\"swiss-latest-qualifier\"><h3>資格加賽結果</h3>${swissMiniStandings(latestQualifier)}</div>` : ''}<form data-swiss-final-form><div class=\"swiss-player-choices\">${finalChoices}</div><input type=\"radio\" name=\"swissFinalMode\" value=\"${config.format}\" checked hidden><button class=\"button button-primary\" type=\"submit\">建立第二階段</button></form></section>`;
}

function swissRoundArenaCount(tournament, round, arenaCount) {
  if (tournament.swissStage2Config && ['final', 'placement'].includes(round.phase)) return arenaCount;
  return round.phase === 'final' ? 1 : arenaCount;
}

function roundRobinTieBreakPanel(tournament, canManage) {"""
)

replace_regex(
    'src/views/schedule.js',
    r"function swissStageGuide\(tournament\) \{[\s\S]*?\n\}\n\nfunction swissChampionLabel",
    """function swissStageGuide(tournament) {
  const config = readSwissStage2Config(tournament);
  if (config) {
    return {
      preliminary: `完成第四輪後確認 Top ${config.advanceCount} 晉級資格`,
      qualification: `第一階段完成，等待確認 Top ${config.advanceCount} 或處理資格加賽`,
      qualifier: `Top ${config.advanceCount} 資格加賽進行中`,
      final: tournament.activePlacementSeriesId ? '冠亞名次加賽進行中' : tournament.swissFinalMode === 'swiss' ? `Top ${config.advanceCount} 第二階段瑞士輪進行中` : `Top ${config.advanceCount} 第二階段單淘汰進行中`,
      completed: tournament.swissFinalMode === 'swiss' ? '第二階段瑞士輪已完成' : '第二階段單淘汰已完成',
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

function swissChampionLabel"""
)

replace_regex(
    'src/views/schedule.js',
    r"function swissChampionLabel\(tournament\) \{[\s\S]*?\n\}\n\nfunction roundPhaseLabel",
    """function swissChampionLabel(tournament) {
  if (tournament.swissStage2Config) {
    if (tournament.swissFinalMode === 'swiss') return '第二階段瑞士輪第一名';
    if (tournament.swissFinalMode === 'single_elimination') return '第二階段單淘汰冠軍';
  }
  if (tournament.swissFinalMode === 'single_elimination') return '四強單淘汰賽冠軍';
  if (tournament.swissFinalMode === 'standings') return '瑞士輪積分榜第一名';
  return '四強循環賽第一名';
}

function roundPhaseLabel"""
)

replace_regex(
    'src/views/schedule.js',
    r"function roundPhaseLabel\(round, roundIndex\) \{[\s\S]*?\n\}\n\nfunction roundColumnView",
    """function roundPhaseLabel(round, roundIndex) {
  const phase = round.phase || 'preliminary';
  if (phase === 'qualifier') return 'QUALIFIER';
  if (phase === 'placement') return 'TIE BREAK';
  if (round.seriesId === 'stage2-swiss' || String(round.name || '').startsWith('第二階段')) return 'STAGE 2';
  if (phase === 'final') return 'TOP 4 FINAL';
  return `ROUND ${String(roundIndex + 1).padStart(2, '0')}`;
}

function roundColumnView"""
)


# ---------------------------------------------------------------------------
# Main UI confirmation: name the configured second stage correctly.
# ---------------------------------------------------------------------------
replace_once(
    'src/main.js',
    "    const label = mode === 'single_elimination' ? '前四單淘汰決賽（含季軍賽）' : '前四循環決賽';",
    """    const selectedTournament = state.tournaments.find((item) => item.id === state.selectedTournamentId);
    const configuredStage2 = selectedTournament?.swissStage2Config;
    const label = configuredStage2
      ? `第二階段${mode === 'single_elimination' ? '單淘汰賽' : '瑞士輪'}`
      : mode === 'single_elimination' ? '前四單淘汰決賽（含季軍賽）' : '前四循環決賽';"""
)


# ---------------------------------------------------------------------------
# Regression coverage.
# ---------------------------------------------------------------------------
replace_once(
    'tests/swiss.test.mjs',
    "  getTournamentStandings,",
    "  getTournamentStandings,\n  getSwissPhaseStandings,"
)

replace_once(
    'tests/swiss.test.mjs',
    """assert.match(manageView(), /瑞士制/);
assert.match(manageView(), /name=\"arenaCount\"/);""",
    """assert.match(manageView(), /瑞士制/);
assert.match(manageView(), /name=\"arenaCount\"/);
assert.match(manageView(), /name=\"swissAdvanceCount\"/);
assert.match(manageView(), /name=\"swissStage2Format\"/);
assert.match(manageView(), /name=\"swissStage2Rounds\"/);"""
)

replace_once(
    'tests/swiss.test.mjs',
    """const multiArena = startTournament(checkInAll(createTournament('雙台瑞士賽', players, 'swiss', 2)));""",
    """const top8Players = Array.from({ length: 12 }, (_, index) => `Top8-${index + 1}`);
let top8Stage = {
  ...createTournament('48人流程縮小驗證', top8Players, 'swiss', 2),
  swissStage2Config: { advanceCount: 8, format: 'swiss', rounds: 4 },
};
top8Stage = startTournament(checkInAll(top8Stage));
while (top8Stage.swissStage === 'preliminary') top8Stage = finishCurrentRound(top8Stage);
assert.equal(top8Stage.swissStage, 'qualification');
const top8Rows = getTournamentStandings(top8Stage);
const top8Finalists = top8Rows.slice(0, 8).map((row) => row.player);
const top8QualificationView = scheduleView([top8Stage], top8Stage.id, true);
assert.match(top8QualificationView, /確認 Top 8 並建立第二階段/);
assert.match(top8QualificationView, /value=\"swiss\" checked hidden/);
top8Stage = startSwissFinal(top8Stage, top8Finalists, 'single_elimination');
assert.equal(top8Stage.swissFinalMode, 'swiss', '賽前設定應鎖定第二階段為瑞士輪');
assert.equal(top8Stage.finalists.length, 8);
assert.equal(top8Stage.rounds.at(-1).matches.length, 4);
assert.ok(getSwissPhaseStandings(top8Stage, 'final').every((row) => row.wins === 0 && row.totalPoints === 0), '第二階段統計應從零開始');
while (top8Stage.swissStage === 'final') top8Stage = finishCurrentRound(top8Stage);
assert.equal(top8Stage.status, '已完成');
assert.equal(top8Stage.swissStage, 'completed');
assert.equal(top8Stage.rounds.filter((round) => round.seriesId === 'stage2-swiss').length, 4);
assert.equal(top8Stage.swissFinalTopTwo.length, 2);
assert.equal(top8Stage.champion, top8Stage.swissFinalTopTwo[0]);
assertNoRepeatedPairings(top8Stage.rounds.filter((round) => round.seriesId === 'stage2-swiss'));
const top8CompletedView = scheduleView([top8Stage], top8Stage.id, true);
assert.match(top8CompletedView, /STAGE 2/);
assert.match(top8CompletedView, /第二階段瑞士輪第一名/);

const tenWayTiePlayers = Array.from({ length: 10 }, (_, index) => `同分-${index + 1}`);
const top8TieProbe = {
  ...createTournament('Top8切線同分', tenWayTiePlayers, 'swiss'),
  status: '進行中',
  swissStage: 'qualification',
  swissStage2Config: { advanceCount: 8, format: 'swiss', rounds: 4 },
};
const top8TieView = scheduleView([top8TieProbe], top8TieProbe.id, true);
const top8QualifierForm = top8TieView.match(/<form data-swiss-qualifier-form>[\\s\\S]*?<\\/form>/)?.[0] || '';
assert.equal((top8QualifierForm.match(/name=\"candidate\"/g) || []).length, 10, 'Top8 切線同分時應只建立切線同分群組且不可受舊 6 人上限限制');
const top8Qualifier = startSwissQualifier(top8TieProbe, tenWayTiePlayers);
assert.equal(top8Qualifier.swissStage, 'qualifier');
assert.equal(top8Qualifier.swissQualifierSlots, 8);
assert.equal(top8Qualifier.rounds.filter((round) => round.phase === 'qualifier').length, 9);

let top8Knockout = {
  ...createTournament('Top8單淘汰第二階段', top8Players, 'swiss'),
  status: '進行中',
  swissStage: 'qualification',
  swissStage2Config: { advanceCount: 8, format: 'single_elimination', rounds: 4 },
};
top8Knockout = startSwissFinal(top8Knockout, top8Players.slice(0, 8), 'swiss');
assert.equal(top8Knockout.swissFinalMode, 'single_elimination');
assert.equal(top8Knockout.rounds.at(-1).matches.length, 4);
while (top8Knockout.swissStage === 'final') top8Knockout = finishCurrentRound(top8Knockout);
assert.equal(top8Knockout.status, '已完成');
assert.equal(getTournamentStandings(top8Knockout).filter((row) => top8Knockout.finalists.includes(row.player)).length, 8, 'Top8 單淘汰完成後八位晉級者都要保留在排行榜');

const multiArena = startTournament(checkInAll(createTournament('雙台瑞士賽', players, 'swiss', 2)));"""
)

# Remove this temporary patch runner and its workflow in the generated commit.
for temp in [ROOT / 'scripts/apply-two-stage-swiss.py', ROOT / '.github/workflows/apply-two-stage-swiss.yml']:
    if temp.exists():
        temp.unlink()

print('Applied two-stage Swiss patch')

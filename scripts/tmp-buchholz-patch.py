from pathlib import Path
import re
import textwrap


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'missing pattern: {label}')
    return text.replace(old, new, 1)


def regex_once(text, pattern, replacement, label, flags=re.S):
    updated, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f'expected one match for {label}, got {count}')
    return updated

# --- tournament domain: versioned ranking rule and old-data compatibility ---
path = Path('src/domain/tournament.js')
text = path.read_text()
text = replace_once(
    text,
    "import { startRoundRobinTieBreak as createRoundRobinTieBreak } from '../formats/round-robin.js';\n",
    "import { startRoundRobinTieBreak as createRoundRobinTieBreak } from '../formats/round-robin.js';\nimport {\n  DEFAULT_SWISS_RANKING_RULE,\n  SWISS_RANKING_RULE_LEGACY,\n  normalizeSwissRankingRule,\n} from './ranking/swiss-ranking.js';\n",
    'tournament ranking import',
)
text = replace_once(
    text,
    "    ...(format.initialState?.() || {}),\n  };\n}\n\nexport function duplicateTournament",
    "    ...(format.initialState?.() || {}),\n    ...(format.id === 'swiss' ? { swissRankingRule: DEFAULT_SWISS_RANKING_RULE } : {}),\n  };\n}\n\nexport function duplicateTournament",
    'new tournament default ranking',
)
text = replace_once(
    text,
    "  if (normalized.format === 'swiss' && normalized.swissStage2Config) {\n    duplicated.swissStage2Config = structuredClone(normalized.swissStage2Config);\n  }\n  return duplicated;",
    "  if (normalized.format === 'swiss' && normalized.swissStage2Config) {\n    duplicated.swissStage2Config = structuredClone(normalized.swissStage2Config);\n  }\n  if (normalized.format === 'swiss') {\n    duplicated.swissRankingRule = normalizeSwissRankingRule(normalized.swissRankingRule, SWISS_RANKING_RULE_LEGACY);\n  }\n  return duplicated;",
    'duplicate ranking rule',
)
text = replace_once(
    text,
    "  const normalizedDrinkSettings = normalizeDrinkSettings(drinkSettings, normalized.drinkSettings);\n  assertSelectedDrinkOptionsRemain(participantDetails, normalizedDrinkSettings);\n  return {",
    "  const normalizedDrinkSettings = normalizeDrinkSettings(drinkSettings, normalized.drinkSettings);\n  const swissRankingRule = format.id === 'swiss'\n    ? normalized.format === 'swiss'\n      ? normalizeSwissRankingRule(normalized.swissRankingRule, SWISS_RANKING_RULE_LEGACY)\n      : DEFAULT_SWISS_RANKING_RULE\n    : null;\n  assertSelectedDrinkOptionsRemain(participantDetails, normalizedDrinkSettings);\n  return {",
    'draft ranking preservation',
)
text = replace_once(
    text,
    "    ...(format.initialState?.() || {}),\n  };\n}\n\nexport function setDraftPlayerCheckedIn",
    "    ...(format.initialState?.() || {}),\n    ...(format.id === 'swiss' ? { swissRankingRule } : {}),\n  };\n}\n\nexport function setDraftPlayerCheckedIn",
    'draft ranking result',
)
text = replace_once(
    text,
    "      drinkSettings: normalizeDrinkSettings(tournament.drinkSettings, createEmptyDrinkSettings()),\n      ...(format.id === 'swiss' && tournament.status === '準備中' && tournament.swissVersion !== 2 ? format.initialState() : {}),",
    "      drinkSettings: normalizeDrinkSettings(tournament.drinkSettings, createEmptyDrinkSettings()),\n      ...(format.id === 'swiss' ? {\n        swissRankingRule: normalizeSwissRankingRule(tournament.swissRankingRule, SWISS_RANKING_RULE_LEGACY),\n      } : {}),\n      ...(format.id === 'swiss' && tournament.status === '準備中' && tournament.swissVersion !== 2 ? format.initialState() : {}),",
    'normalize old swiss ranking',
)
path.write_text(text)

# --- Swiss format: use the ranking engine for Swiss phases only ---
path = Path('src/formats/swiss.js')
text = path.read_text()
text = replace_once(
    text,
    "/** 四輪瑞士制策略：四輪預賽後可依賽前設定進入第二階段，並保留舊賽事流程相容性。 */\n",
    "/** 四輪瑞士制策略：四輪預賽後可依賽前設定進入第二階段，並保留舊賽事流程相容性。 */\nimport {\n  SWISS_RANKING_RULE_LEGACY,\n  normalizeSwissRankingRule,\n  rankSwissStandings,\n} from '../domain/ranking/swiss-ranking.js';\n",
    'swiss ranking import',
)
text = regex_once(
    text,
    r"    const preliminary = rankByRecordAndPoints\(\n      tournament\.players,\n      preliminaryStats,\n      tournament,\n    \);\n\n    if \(!tournament\.finalists\?\.length\) \{\n      return addRanks\(preliminary, tournament, rankingKey\);\n    \}",
    "    const preliminary = rankSwissPhase(tournament, tournament.players, preliminaryStats, preliminaryRounds, PRELIMINARY_ROUNDS);\n\n    if (!tournament.finalists?.length) {\n      return preliminary;\n    }",
    'preliminary standings',
)
text = replace_once(
    text,
    "    if (phase === 'final' && tournament.swissFinalMode === 'swiss') {\n      return addRanks(rankByRecordAndPoints(players, stats, tournament), tournament, rankingKey);\n    }",
    "    if (phase === 'final' && tournament.swissFinalMode === 'swiss') {\n      return rankSwissPhase(\n        tournament,\n        players,\n        stats,\n        rounds,\n        normalizeSwissStage2Config(tournament.swissStage2Config).rounds,\n      );\n    }",
    'stage2 phase standings',
)
text = replace_once(
    text,
    "    return addRanks(\n      rankByRecordAndPoints(players, stats, tournament),\n      tournament,\n      rankingKey,\n    );\n  },",
    "    return rankSwissPhase(tournament, players, stats, rounds, PRELIMINARY_ROUNDS);\n  },",
    'default swiss phase standings',
)
text = replace_once(
    text,
    "          const orderedPlayers = rankByRecordAndPoints(activeFinalists, stage2Stats, tournament).map((row) => row.player);",
    "          const orderedPlayers = rankSwissPhase(\n            tournament,\n            activeFinalists,\n            stage2Stats,\n            stage2Rounds,\n            targetRounds,\n          ).map((row) => row.player);",
    'stage2 pairing order',
)
text = replace_once(
    text,
    "    const orderedPlayers = rankByRecordAndPoints(activePlayers, preliminaryStats).map((row) => row.player);",
    "    const orderedPlayers = rankSwissPhase(\n      tournament,\n      activePlayers,\n      preliminaryStats,\n      preliminaryRounds,\n      PRELIMINARY_ROUNDS,\n    ).map((row) => row.player);",
    'preliminary pairing order',
)
text = replace_once(
    text,
    "function rankByRecordAndPoints(\n  players,\n  stats,\n  tournament = null,\n) {",
    "function rankSwissPhase(tournament, players, stats, rounds, totalRounds) {\n  return rankSwissStandings({\n    players,\n    stats,\n    rounds,\n    participantStates: tournament?.participantStates || {},\n    rule: normalizeSwissRankingRule(tournament?.swissRankingRule, SWISS_RANKING_RULE_LEGACY),\n    totalRounds,\n  }).map((row) => ({\n    ...row,\n    isChampion: tournament?.champion === row.player,\n    participantStatus: tournament?.participantStates?.[row.player]?.status || 'active',\n  }));\n}\n\nfunction rankByRecordAndPoints(\n  players,\n  stats,\n  tournament = null,\n) {",
    'swiss phase ranking helper',
)
text = replace_once(
    text,
    "function preliminaryRanking(tournament) {\n  const preliminaryRounds = tournament.rounds.filter((round) => (round.phase || 'preliminary') === 'preliminary');\n  const stats = deriveStats(tournament.players, preliminaryRounds);\n  return addRanks(rankByRecordAndPoints(tournament.players, stats, tournament), tournament, rankingKey);\n}",
    "function preliminaryRanking(tournament) {\n  const preliminaryRounds = tournament.rounds.filter((round) => (round.phase || 'preliminary') === 'preliminary');\n  const stats = deriveStats(tournament.players, preliminaryRounds);\n  return rankSwissPhase(tournament, tournament.players, stats, preliminaryRounds, PRELIMINARY_ROUNDS);\n}",
    'qualification ranking',
)
text = replace_once(
    text,
    "function rankSwissStageTwoBase(tournament) {\n  const rounds = stageTwoSwissRounds(tournament);\n  const stats = deriveStats(tournament.finalists || [], rounds);\n  return addRanks(rankByRecordAndPoints(tournament.finalists || [], stats, tournament), tournament, rankingKey);\n}",
    "function rankSwissStageTwoBase(tournament) {\n  const rounds = stageTwoSwissRounds(tournament);\n  const stats = deriveStats(tournament.finalists || [], rounds);\n  return rankSwissPhase(\n    tournament,\n    tournament.finalists || [],\n    stats,\n    rounds,\n    normalizeSwissStage2Config(tournament.swissStage2Config).rounds,\n  );\n}",
    'stage2 base ranking',
)
path.write_text(text)

# --- Manage UI: ranking rule is explicit and locked with other draft settings ---
path = Path('src/views/manage.js')
text = path.read_text()
text = replace_once(
    text,
    "import { listTournamentFormats } from '../formats/registry.js';\n",
    "import { listTournamentFormats } from '../formats/registry.js';\nimport {\n  DEFAULT_SWISS_RANKING_RULE,\n  SWISS_RANKING_RULE_BUCHHOLZ,\n  SWISS_RANKING_RULE_LEGACY,\n  normalizeSwissRankingRule,\n} from '../domain/ranking/swiss-ranking.js';\n",
    'manage ranking import',
)
text = replace_once(
    text,
    "  const swissStage2 = normalizeSwissStage2Config(tournament?.swissStage2Config);\n",
    "  const swissStage2 = normalizeSwissStage2Config(tournament?.swissStage2Config);\n  const swissRankingRule = normalizeSwissRankingRule(\n    tournament?.swissRankingRule,\n    tournament ? SWISS_RANKING_RULE_LEGACY : DEFAULT_SWISS_RANKING_RULE,\n  );\n",
    'manage selected ranking',
)
text = replace_once(
    text,
    "        <div data-swiss-stage2-settings ${selectedFormat === 'swiss' ? '' : 'hidden'}>\n          <div class=\"field-grid\">",
    "        <div data-swiss-stage2-settings ${selectedFormat === 'swiss' ? '' : 'hidden'}>\n          <label class=\"field\"><span>瑞士輪排名方式</span><select name=\"swissRankingRule\"><option value=\"${SWISS_RANKING_RULE_BUCHHOLZ}\" ${swissRankingRule === SWISS_RANKING_RULE_BUCHHOLZ ? 'selected' : ''}>對手強度排名（推薦）</option><option value=\"${SWISS_RANKING_RULE_LEGACY}\" ${swissRankingRule === SWISS_RANKING_RULE_LEGACY ? 'selected' : ''}>傳統排名（舊版相容）</option></select><small>推薦：勝場 → 對手勝場總和 → 總得分 → 直接對戰；賽事開始後鎖定。</small></label>\n          <div class=\"field-grid\">",
    'manage ranking field',
)
text = replace_once(
    text,
    "      result = applySwissStage2Config(result, form);\n      options.onSubmit(result);",
    "      result = applySwissStage2Config(result, form);\n      result = applySwissRankingRule(result, form);\n      options.onSubmit(result);",
    'manage apply ranking',
)
text = replace_once(
    text,
    "function uniqueId(prefix) {",
    "function applySwissRankingRule(tournament, form) {\n  const next = { ...tournament };\n  delete next.swissRankingRule;\n  if (next.format !== 'swiss') return next;\n  next.swissRankingRule = normalizeSwissRankingRule(\n    form.elements.swissRankingRule?.value,\n    DEFAULT_SWISS_RANKING_RULE,\n  );\n  return next;\n}\n\nfunction uniqueId(prefix) {",
    'manage ranking helper',
)
path.write_text(text)

# --- Schedule UI: expose Buchholz without embedding ranking logic in the view ---
path = Path('src/views/schedule.js')
text = path.read_text()
text = replace_once(
    text,
    "import { getTournamentFormat } from '../formats/registry.js';\n",
    "import { getTournamentFormat } from '../formats/registry.js';\nimport { SWISS_RANKING_RULE_BUCHHOLZ, normalizeSwissRankingRule } from '../domain/ranking/swiss-ranking.js';\n",
    'schedule ranking import',
)
text = regex_once(
    text,
    r"function leaderboardView\(tournament, rows, isSwiss\) \{.*?\n\}\n\nfunction leaderboardDescription\(tournament, isSwiss\) \{.*?\n\}\n\nfunction leaderboardPlayerRowLegacy",
    textwrap.dedent('''
    function leaderboardView(tournament, rows, isSwiss) {
      const showOpponentWins = shouldShowSwissOpponentWins(tournament);
      const rowClass = showOpponentWins ? ' has-buchholz' : '';
      const opponentHeader = showOpponentWins ? '<span>對手勝場</span>' : '';
      const description = leaderboardDescription(tournament, isSwiss, showOpponentWins);
      const completed = tournament.status === '已完成';
      return `<section class="leaderboard"><div class="leaderboard-heading"><div><p class="kicker">LIVE STANDINGS</p><h2>賽事排行榜</h2></div><span>${description}；點選選手可查看已完成對戰${completed ? '與下載戰績圖' : ''}</span></div><div class="leaderboard-table"><div class="leaderboard-row leaderboard-header${rowClass}"><span>名次</span><span>選手</span><span>勝</span><span>敗</span>${opponentHeader}<span>總得分</span></div>${rows.map((row) => leaderboardPlayerRow(tournament, row, completed, rows, showOpponentWins)).join('')}</div></section>`;
    }

    function leaderboardDescription(tournament, isSwiss, showOpponentWins = false) {
      if (!isSwiss) return '依冠軍、勝場、總分與得失分差排序';
      if (showOpponentWins) return '依勝場、對手勝場總和、總得分、直接對戰依序排名；輪空以該階段總輪數一半計入對手勝場';
      if (tournament.swissFinalMode === 'single_elimination' && ['final', 'completed'].includes(tournament.swissStage)) {
        return '四強名次依淘汰賽結果，其餘選手依瑞士輪成績排序';
      }
      if (tournament.swissFinalMode === 'round_robin' && ['final', 'completed'].includes(tournament.swissStage)) {
        return '四強循環依勝場、敗場、總得分排序；兩人完全同分時比較直接對戰，三人以上同分會自動加賽';
      }
      return '依勝場、敗場、總得分依序排名';
    }

    function shouldShowSwissOpponentWins(tournament) {
      if (tournament.format !== 'swiss'
        || normalizeSwissRankingRule(tournament.swissRankingRule) !== SWISS_RANKING_RULE_BUCHHOLZ) return false;
      const stage = tournament.swissStage || 'preliminary';
      if (['preliminary', 'qualification'].includes(stage)) return true;
      if (stage === 'qualifier') return false;
      if (['final', 'completed'].includes(stage) && tournament.swissFinalMode === 'swiss') return true;
      return stage === 'completed' && tournament.swissFinalMode === 'standings';
    }

    function leaderboardPlayerRowLegacy''').strip(),
    'leaderboard shell',
)
text = regex_once(
    text,
    r"function leaderboardPlayerRow\(tournament, row, canDownloadShareCard, rows = \[\]\) \{.*?\n\}\n\nfunction swissDirectMatchReason",
    textwrap.dedent('''
    function leaderboardPlayerRow(tournament, row, canDownloadShareCard, rows = [], showOpponentWins = false) {
      const matches = playerCompletedMatches(tournament, row.player);
      const history = matches.length ? matches.map((entry) => `<li><span>${escapeText(roundPhaseLabel(entry.round, entry.roundIndex))}</span><b>${escapeText(entry.opponent)}</b><i>${escapeText(entry.result)}</i></li>`).join('') : '<li class="player-history-empty">尚無已完成對戰</li>';
      const stages = stageSummaryView(tournament, row.player);
      const status = row.isChampion ? '<small>CHAMPION</small>' : row.participantStatus === 'no_show' ? '<small>未出席</small>' : row.participantStatus === 'withdrawn' ? '<small>已退賽</small>' : '';
      const rankingReason = row.rankResolution?.criterion === 'head_to_head'
        ? '<small>直接對戰判定</small>'
        : swissDirectMatchReason(tournament, row, rows);
      const opponentWins = showOpponentWins ? `<span>${formatOpponentWins(row.opponentWins)}</span>` : '';
      return `<details class="leaderboard-player ${row.isChampion ? 'is-champion' : ''} ${row.participantStatus !== 'active' ? 'is-inactive' : ''}"><summary class="leaderboard-row${showOpponentWins ? ' has-buchholz' : ''}"><span class="rank">${row.rank === 1 ? icons.trophy : String(row.rank).padStart(2, '0')}</span><strong>${escapeText(row.player)}${status}${rankingReason}</strong><span>${row.wins}</span><span>${row.losses}</span>${opponentWins}<b>${row.totalPoints}</b></summary><div class="player-history"><h3>${escapeText(row.player)}的階段成績</h3>${stages}<ul>${history}</ul>${canDownloadShareCard ? `<button class="button button-primary player-share-card" data-download-share-card="${escapeAttribute(row.player)}">下載戰績圖</button>` : ''}</div></details>`;
    }

    function formatOpponentWins(value) {
      const number = Number(value) || 0;
      return Number.isInteger(number) ? String(number) : number.toFixed(1);
    }

    function swissDirectMatchReason''').strip(),
    'leaderboard player row',
)
text = regex_once(
    text,
    r"function stageSummaryView\(tournament, player\) \{.*?\n\}\n\nfunction playerCompletedMatches",
    textwrap.dedent('''
    function stageSummaryView(tournament, player) {
      const groups = new Map();
      (tournament.rounds || []).forEach((round) => {
        const phase = round.phase || 'preliminary';
        const key = phase === 'preliminary'
          ? 'preliminary'
          : phase === 'qualifier'
            ? 'qualifier'
            : phase === 'placement'
              ? 'placement'
              : round.seriesId === 'stage2-swiss'
                ? 'stage2'
                : 'final';
        const label = {
          preliminary: '第一階段瑞士輪',
          qualifier: '資格加賽',
          placement: '冠亞名次加賽',
          stage2: '第二階段瑞士輪',
          final: '決賽',
        }[key];
        if (!groups.has(key)) groups.set(key, { label, wins: 0, losses: 0, points: 0, opponentWins: null });
        round.matches.filter((match) => match.status === '已完成' && [match.playerA, match.playerB].includes(player)).forEach((match) => {
          const group = groups.get(key);
          const isA = match.playerA === player;
          group.points += Number(isA ? match.scoreA : match.scoreB) || 0;
          if (match.winner === player) group.wins += 1; else group.losses += 1;
        });
      });

      if (normalizeSwissRankingRule(tournament.swissRankingRule) === SWISS_RANKING_RULE_BUCHHOLZ) {
        const preliminary = getSwissPhaseStandings(tournament, 'preliminary').find((row) => row.player === player);
        if (groups.has('preliminary') && preliminary) groups.get('preliminary').opponentWins = preliminary.opponentWins;
        if (tournament.swissFinalMode === 'swiss' && groups.has('stage2')) {
          const stage2 = getSwissPhaseStandings(tournament, 'final').find((row) => row.player === player);
          if (stage2) groups.get('stage2').opponentWins = stage2.opponentWins;
        }
      }

      return `<div class="leaderboard-stage-summary">${[...groups.values()].map((value) => `<span><b>${value.label}</b><i>${value.wins} 勝 ${value.losses} 敗 · ${value.points} 分${value.opponentWins == null ? '' : ` · 對手勝場 ${formatOpponentWins(value.opponentWins)}`}</i></span>`).join('')}</div>`;
    }

    function playerCompletedMatches''').strip(),
    'stage summary',
)
path.write_text(text)

# --- Share-card domain and template: show the ranking-stage Buchholz metric ---
path = Path('src/domain/share-card.js')
text = path.read_text()
text = replace_once(
    text,
    "import { getTournamentStandings, normalizeTournament } from './tournament.js';",
    "import { getSwissPhaseStandings, getTournamentStandings, normalizeTournament } from './tournament.js';\nimport { SWISS_RANKING_RULE_BUCHHOLZ, normalizeSwissRankingRule } from './ranking/swiss-ranking.js';",
    'share card ranking import',
)
text = regex_once(
    text,
    r"function completedStageStats\(tournament, playerName\) \{.*?\n\}\n\nfunction completedPlayerMatches",
    textwrap.dedent('''
    function completedStageStats(tournament, playerName) {
      const groups = new Map();
      (tournament.rounds || []).forEach((round) => {
        const phase = round.phase || 'preliminary';
        const key = phase === 'preliminary'
          ? 'preliminary'
          : phase === 'qualifier'
            ? 'qualifier'
            : phase === 'placement'
              ? 'placement'
              : round.seriesId === 'stage2-swiss'
                ? 'stage2'
                : 'final';
        const label = {
          preliminary: '第一階段瑞士輪',
          qualifier: '資格加賽',
          placement: '冠亞名次加賽',
          stage2: '第二階段瑞士輪',
          final: '決賽',
        }[key];
        if (!groups.has(key)) groups.set(key, { label, wins: 0, losses: 0, points: 0, opponentWins: null });
        (round.matches || []).filter((match) => isFormalCompletedMatch(match) && [match.playerA, match.playerB].includes(playerName)).forEach((match) => {
          const value = groups.get(key);
          const isA = match.playerA === playerName;
          value.points += Number(isA ? match.scoreA : match.scoreB) || 0;
          if (match.winner === playerName) value.wins += 1; else value.losses += 1;
        });
      });

      if (tournament.format === 'swiss'
        && normalizeSwissRankingRule(tournament.swissRankingRule) === SWISS_RANKING_RULE_BUCHHOLZ) {
        const preliminary = getSwissPhaseStandings(tournament, 'preliminary').find((row) => row.player === playerName);
        if (groups.has('preliminary') && preliminary) groups.get('preliminary').opponentWins = preliminary.opponentWins;
        if (tournament.swissFinalMode === 'swiss' && groups.has('stage2')) {
          const stage2 = getSwissPhaseStandings(tournament, 'final').find((row) => row.player === playerName);
          if (stage2) groups.get('stage2').opponentWins = stage2.opponentWins;
        }
      }

      return [...groups.values()];
    }

    function completedPlayerMatches''').strip(),
    'share card stage stats',
)
text = replace_once(
    text,
    "  if (round.phase === 'qualifier') return '資格積分決定賽';\n  if (round.phase === 'final') return '四強循環決賽';",
    "  if (round.phase === 'qualifier') return '資格積分決定賽';\n  if (round.phase === 'placement') return '冠亞名次加賽';\n  if (round.seriesId === 'stage2-swiss') return '第二階段瑞士輪';\n  if (round.phase === 'final') return '決賽';",
    'share card phase labels',
)
path.write_text(text)

path = Path('src/views/result-share-card.js')
text = path.read_text()
text = replace_once(
    text,
    "  const stages = (data.stageStats || []).map((stage) => `<span><b>${escapeText(stage.label)}</b><i>${stage.wins} 勝 ${stage.losses} 敗 · ${stage.points} 分</i></span>`).join('');",
    "  const stages = (data.stageStats || []).map((stage) => `<span><b>${escapeText(stage.label)}</b><i>${stage.wins} 勝 ${stage.losses} 敗 · ${stage.points} 分</i>${stage.opponentWins == null ? '' : `<i>對手勝場 ${formatOpponentWins(stage.opponentWins)}</i>`}</span>`).join('');",
    'share card opponent wins',
)
text = replace_once(
    text,
    "function escapeText(value) {",
    "function formatOpponentWins(value) {\n  const number = Number(value) || 0;\n  return Number.isInteger(number) ? String(number) : number.toFixed(1);\n}\n\nfunction escapeText(value) {",
    'share card opponent formatting',
)
path.write_text(text)

# --- Styles: sixth leaderboard column and share-card secondary ranking metric ---
path = Path('src/styles/app.css')
text = path.read_text()
append = textwrap.dedent('''

/* Buchholz 排名欄位：只在使用新瑞士輪排名規則時套用，舊排行榜版型不變。 */
.leaderboard-row.has-buchholz { grid-template-columns: 90px minmax(180px, 1fr) 76px 76px 112px 110px; }
.result-share-card .share-stage-stats i + i { margin-top: 4px; color: #ff9b95; }
@media (max-width: 620px) {
  .leaderboard-row.has-buchholz { min-width: 0; grid-template-columns: 38px minmax(82px, 1fr) 34px 34px 58px 48px; }
}
''')
if '/* Buchholz 排名欄位' not in text:
    text += append
path.write_text(text)

# --- Focused regression coverage ---
Path('tests/swiss-ranking.test.mjs').write_text(textwrap.dedent('''
import assert from 'node:assert/strict';
import {
  DEFAULT_SWISS_RANKING_RULE,
  SWISS_RANKING_RULE_BUCHHOLZ,
  SWISS_RANKING_RULE_LEGACY,
  calculateOpponentWins,
  rankSwissStandings,
} from '../src/domain/ranking/swiss-ranking.js';
import {
  createTournament,
  duplicateTournament,
  getSwissPhaseStandings,
  normalizeTournament,
  updateDraftTournament,
} from '../src/domain/tournament.js';
import { buildShareCardData } from '../src/domain/share-card.js';
import { ResultShareCard } from '../src/views/result-share-card.js';
import { shareCardAssets } from '../src/config/share-card-assets.js';
import { manageView } from '../src/views/manage.js';
import { scheduleView } from '../src/views/schedule.js';

function stats(values) {
  return Object.fromEntries(Object.entries(values).map(([player, value]) => [player, {
    wins: value.wins || 0,
    losses: value.losses || 0,
    pointsFor: value.points || 0,
    byeCount: value.byeCount || 0,
  }]));
}

function match(playerA, playerB, winner = null, scoreA = null, scoreB = null) {
  return {
    playerA,
    playerB,
    winner,
    scoreA,
    scoreB,
    status: playerB === '輪空' ? '輪空晉級' : winner ? '已完成' : '可開始',
  };
}

{
  const players = ['A', 'B', 'C', 'D'];
  const values = stats({ A: { wins: 4 }, B: { wins: 3 }, C: { wins: 2 }, D: { wins: 1 } });
  const rounds = [
    { matches: [match('A', 'B', 'A', 4, 2)] },
    { matches: [match('A', 'C', 'A', 4, 1)] },
    { matches: [match('A', 'D', 'A', 4, 0)] },
    { matches: [match('A', '輪空', 'A')] },
  ];
  const opponentWins = calculateOpponentWins({ players, stats: values, rounds, totalRounds: 4 });
  assert.equal(opponentWins.A, 8, '4 輪賽事的輪空應以 +2 Buchholz 計算');
}

{
  const players = ['A', 'B', 'C'];
  const values = stats({ A: { wins: 2, losses: 1, points: 10 }, B: { wins: 2, losses: 1, points: 10 }, C: { wins: 3, points: 12 } });
  const rounds = [
    { matches: [match('A', 'B', 'A', 4, 3)] },
    { matches: [match('A', 'C', 'C', 2, 4), match('B', 'C', 'C', 1, 4)] },
  ];
  const rows = rankSwissStandings({ players, stats: values, rounds, rule: SWISS_RANKING_RULE_BUCHHOLZ, totalRounds: 4 });
  const a = rows.find((row) => row.player === 'A');
  const b = rows.find((row) => row.player === 'B');
  assert.equal(a.opponentWins, b.opponentWins);
  assert.equal(a.rank + 1, b.rank, '兩人前三項完全同分且曾交手時，直接對戰勝者應排前');
  assert.equal(a.rankResolution?.criterion, 'head_to_head');
}

{
  const players = ['A', 'B', 'C'];
  const values = stats({ A: { wins: 2, losses: 1, points: 10 }, B: { wins: 2, losses: 1, points: 10 }, C: { wins: 2, losses: 1, points: 10 } });
  const rounds = [
    { matches: [match('A', 'B', 'A', 4, 3)] },
    { matches: [match('B', 'C', 'B', 4, 3)] },
    { matches: [match('C', 'A', 'C', 4, 3)] },
  ];
  const rows = rankSwissStandings({ players, stats: values, rounds, rule: SWISS_RANKING_RULE_BUCHHOLZ, totalRounds: 4 });
  assert.deepEqual(rows.map((row) => row.rank), [1, 1, 1], '三人以上完全同分不能用成對直接對戰硬拆名次');
  assert(rows.every((row) => row.rankResolution?.criterion === 'unresolved'));
}

{
  const players = ['A', 'B'];
  const values = stats({ A: { wins: 2, losses: 1, points: 8 }, B: { wins: 2, losses: 2, points: 20 } });
  const rows = rankSwissStandings({ players, stats: values, rule: SWISS_RANKING_RULE_LEGACY });
  assert.equal(rows[0].player, 'A', 'legacy_v1 必須保留舊版勝場、敗場、總得分排序');
}

{
  const created = createTournament('新規則', ['A', 'B', 'C', 'D'], 'swiss');
  assert.equal(created.swissRankingRule, DEFAULT_SWISS_RANKING_RULE);
  assert.equal(created.swissRankingRule, SWISS_RANKING_RULE_BUCHHOLZ);

  const storedOld = structuredClone(created);
  delete storedOld.swissRankingRule;
  const normalizedOld = normalizeTournament(storedOld);
  assert.equal(normalizedOld.swissRankingRule, SWISS_RANKING_RULE_LEGACY, '缺少欄位的歷史賽事必須維持舊排名');
  assert.equal(duplicateTournament(storedOld).swissRankingRule, SWISS_RANKING_RULE_LEGACY, '複製歷史賽事不得偷偷換排名規則');
  assert.equal(updateDraftTournament(storedOld, storedOld.name, storedOld.players, 'swiss').swissRankingRule, SWISS_RANKING_RULE_LEGACY, '編輯舊草稿不得偷偷換排名規則');

  const nonSwiss = createTournament('切換賽制', ['A', 'B', 'C', 'D'], 'single_elimination');
  assert.equal(updateDraftTournament(nonSwiss, nonSwiss.name, nonSwiss.players, 'swiss').swissRankingRule, SWISS_RANKING_RULE_BUCHHOLZ, '新切換成瑞士制時應使用新預設');
}

{
  const tournament = createTournament('UI 測試', ['A', 'B', 'C', 'D'], 'swiss');
  tournament.participantStates = Object.fromEntries(tournament.players.map((player) => [player, { status: 'active', checkedIn: true }]));
  tournament.status = '進行中';
  tournament.rounds = [{
    name: '瑞士制第 1 輪', phase: 'preliminary', seriesId: 'preliminary', phaseRound: 1,
    matches: [match('A', 'B', 'A', 4, 2), match('C', 'D', 'C', 4, 1)],
  }];
  const html = scheduleView([tournament], tournament.id, true);
  assert.match(html, /對手勝場/);
  assert.match(html, /輪空以該階段總輪數一半/);
  const form = manageView(null);
  assert.match(form, /對手強度排名（推薦）/);
  assert.match(form, /buchholz_v1/);

  const rows = getSwissPhaseStandings(tournament, 'preliminary');
  assert(rows.every((row) => typeof row.opponentWins === 'number'));
}

{
  const tournament = createTournament('戰績圖測試', ['A', 'B', 'C', 'D'], 'swiss');
  tournament.participantStates = Object.fromEntries(tournament.players.map((player) => [player, { status: 'active', checkedIn: true }]));
  tournament.status = '已完成';
  tournament.swissStage = 'completed';
  tournament.swissFinalMode = 'standings';
  tournament.rounds = [
    { name: '瑞士制第 1 輪', phase: 'preliminary', seriesId: 'preliminary', matches: [match('A', 'B', 'A', 4, 2), match('C', 'D', 'C', 4, 1)] },
    { name: '瑞士制第 2 輪', phase: 'preliminary', seriesId: 'preliminary', matches: [match('A', 'C', 'A', 4, 3), match('B', 'D', 'B', 4, 0)] },
  ];
  const data = buildShareCardData(tournament, 'A');
  assert.equal(typeof data.stageStats.find((stage) => stage.label === '第一階段瑞士輪')?.opponentWins, 'number');
  const html = ResultShareCard(data, {
    badge: shareCardAssets.badges.champion,
    showRankNumber: false,
    tag: shareCardAssets.tags.win,
    performanceLabel: '測試',
    leagueLogo: shareCardAssets.logos.league,
    venueLogo: shareCardAssets.logos.venue,
  });
  assert.match(html, /對手勝場/);
}

console.log('swiss ranking v1 tests passed');
'''))

path = Path('scripts/test-fast.mjs')
text = path.read_text()
text = replace_once(
    text,
    "  'tests/swiss.test.mjs',\n",
    "  'tests/swiss.test.mjs',\n  'tests/swiss-ranking.test.mjs',\n",
    'fast ranking test',
)
path.write_text(text)

print('Buchholz integration patch applied')

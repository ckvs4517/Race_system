/** Historical score correction impact analysis and safe Level 1 repair. */
import { getTournamentFormat } from '../../formats/registry.js';
import { normalizeTournament } from './normalization.js';
import { validateFinalScore } from './score-validation.js';

export function analyzeMatchScoreCorrection(tournament, roundIndex, matchIndex, scoreA, scoreB) {
  const normalized = normalizeTournament(tournament);
  if (normalized.bracketVersion !== 2) throw new Error('舊版賽事不支援比分修正。');
  if (!['進行中', '已完成'].includes(normalized.status)) throw new Error('這場賽事目前不能修正比分。');
  validateFinalScore(scoreA, scoreB);

  const round = normalized.rounds?.[roundIndex];
  const match = round?.matches?.[matchIndex];
  if (!match || match.status !== '已完成') throw new Error('只有已完成的比賽可以修正比分。');
  if (match.outcome === 'forfeit' || match.outcome === 'withdrawal') {
    throw new Error('行政判定的比分不能用一般修正改寫，請保留原判定紀錄。');
  }
  if (Number(match.scoreA) === scoreA && Number(match.scoreB) === scoreB) throw new Error('新比分與目前比分相同。');

  const correctedWinner = scoreA > scoreB ? match.playerA : match.playerB;
  const originalWinner = match.winner || (Number(match.scoreA) > Number(match.scoreB) ? match.playerA : match.playerB);
  const format = getTournamentFormat(normalized.format);
  const rounds = structuredClone(normalized.rounds);
  const correctedMatch = rounds[roundIndex].matches[matchIndex];
  correctedMatch.scoreA = scoreA;
  correctedMatch.scoreB = scoreB;
  correctedMatch.winner = correctedWinner;
  const candidate = {
    ...normalized,
    rounds,
    playerStats: format.rebuildStats(normalized.players, rounds),
  };
  const preview = buildImpactPreview(format, normalized, candidate, roundIndex, matchIndex);

  if (correctedWinner !== originalWinner) {
    if (normalized.format === 'single_elimination') {
      return blockedImpact(2, '此修改會改變單淘汰賽晉級結果，目前版本不支援這類 Repair Flow。', preview);
    }
    if (normalized.format === 'win_streak') {
      return blockedImpact(1, '此修改會改變守擂勝者或連勝狀態，目前版本尚未支援這類 Repair Flow。', preview);
    }
    if (!supportsLevelOneRepair(normalized, round)) {
      return blockedImpact(1, unsupportedRepairMessage(normalized, round), preview);
    }
    return repairableImpact(candidate, preview, '此比分修正會改變勝者與賽事戰績，需要確認 Repair Flow。');
  }

  // 單淘汰只要 winner / bracket path 不變，比分數字本身可安全修正。
  if (normalized.format === 'single_elimination') return safeImpact(candidate, preview);

  // Swiss / Round Robin / Win Streak 可能把得失分當成排名依據；不能只檢查 winner。
  const beforeSignature = protectedStandingSignature(format, normalized, round);
  const afterSignature = protectedStandingSignature(format, candidate, rounds[roundIndex]);
  if (beforeSignature !== afterSignature) {
    if (supportsLevelOneRepair(normalized, round)) {
      return repairableImpact(candidate, preview, '此比分修正會改變目前排名或賽事戰績，需要確認 Repair Flow。');
    }
    return blockedImpact(1, unsupportedRepairMessage(normalized, round), preview);
  }

  return safeImpact(candidate, preview);
}

export function correctMatchScore(tournament, roundIndex, matchIndex, scoreA, scoreB) {
  const impact = analyzeMatchScoreCorrection(tournament, roundIndex, matchIndex, scoreA, scoreB);
  if (impact.level !== 0) throw new Error(impact.message);
  return { ...impact.tournament, updatedAt: new Date().toISOString() };
}

export function repairMatchScore(tournament, roundIndex, matchIndex, scoreA, scoreB, reason) {
  const repairReason = String(reason || '').trim();
  if (!repairReason) throw new Error('請填寫比分修正原因。');

  // Full clone is the repair-before snapshot. Nothing is persisted until this
  // function completes and the Worker commits the returned tournament record.
  const beforeSnapshot = structuredClone(normalizeTournament(tournament));
  const impact = analyzeMatchScoreCorrection(beforeSnapshot, roundIndex, matchIndex, scoreA, scoreB);
  if (impact.level !== 1 || !impact.repairable || !impact.tournament) throw new Error(impact.message);

  const timestamp = new Date().toISOString();
  const repaired = reconcileTournamentState(impact.tournament, beforeSnapshot, roundIndex);
  const preview = impact.preview;
  const entry = {
    id: `repair-${Date.now()}-${roundIndex}-${matchIndex}`,
    timestamp,
    roundIndex,
    matchIndex,
    roundName: preview.roundName,
    phase: preview.phase,
    playerA: preview.before.playerA,
    playerB: preview.before.playerB,
    before: preview.before,
    after: preview.after,
    reason: repairReason,
    impactLevel: 1,
    changes: preview.changes,
    lockedRoundIndexes: preview.lockedRoundIndexes,
    preservedRoundIndexes: preview.preservedRoundIndexes,
  };

  return {
    ...repaired,
    repairHistory: [...(beforeSnapshot.repairHistory || []), entry],
    updatedAt: timestamp,
  };
}

function reconcileTournamentState(candidate, beforeSnapshot, roundIndex) {
  const format = getTournamentFormat(candidate.format);
  const round = candidate.rounds?.[roundIndex];
  const phase = round?.phase || 'preliminary';

  if (candidate.format === 'round_robin' && phase === 'round_robin') {
    const standardRounds = candidate.rounds.filter((item) => (item.phase || 'round_robin') === 'round_robin');
    const standardComplete = standardRounds.length > 0
      && standardRounds.every((item) => item.matches.every((match) => match.status === '已完成'));
    const hasTieBreakHistory = candidate.rounds.some((item) => item.phase === 'tie_break');
    if (standardComplete && !hasTieBreakHistory) {
      const standings = format.getStandings({ ...candidate, champion: null });
      const leaders = standings.filter((row) => row.rank === 1);
      const champion = leaders.length === 1 ? leaders[0].player : null;
      return {
        ...candidate,
        champion,
        roundRobinStage: champion ? 'completed' : 'tied',
        status: champion ? '已完成' : '進行中',
      };
    }
  }

  if (
    candidate.format === 'swiss'
    && phase === 'preliminary'
    && beforeSnapshot.swissStage === 'completed'
    && beforeSnapshot.swissFinalMode === 'standings'
    && !(beforeSnapshot.finalists || []).length
  ) {
    const rows = format.getPhaseStandings({ ...candidate, champion: null }, 'preliminary');
    const leaders = rows.filter((row) => row.rank === 1);
    return {
      ...candidate,
      champion: leaders.length === 1 ? leaders[0].player : null,
      status: '已完成',
      swissStage: 'completed',
    };
  }

  return candidate;
}

function supportsLevelOneRepair(tournament, round) {
  const phase = round?.phase || 'preliminary';
  if (tournament.format === 'round_robin') return phase === 'round_robin';
  if (tournament.format !== 'swiss') return false;
  if (phase === 'preliminary' || phase === 'qualifier') return true;
  // Ongoing round-robin Stage 2 has fixed generated pairings, so historical
  // score repair is safe as long as we preserve every already-generated round.
  return phase === 'final'
    && tournament.swissFinalMode === 'round_robin'
    && tournament.status === '進行中';
}

function unsupportedRepairMessage(tournament, round) {
  const phase = round?.phase || 'preliminary';
  if (tournament.format === 'swiss' && phase === 'final' && tournament.swissFinalMode === 'single_elimination') {
    return '此修改會影響第二階段單淘汰結構，目前版本不支援這類 Repair Flow。';
  }
  if (tournament.format === 'swiss' && ['final', 'placement'].includes(phase)) {
    return '此階段的比分修正會影響第二階段／名次賽結果，目前版本尚未支援這類 Repair Flow。';
  }
  if (tournament.format === 'round_robin' && phase === 'tie_break') {
    return '同分加賽的 winner-changing 修正目前尚未支援 Repair Flow。';
  }
  return '此比分修正會影響賽事狀態，目前版本尚未支援這類 Repair Flow。';
}

function buildImpactPreview(format, before, after, roundIndex, matchIndex) {
  const beforeRound = before.rounds[roundIndex];
  const afterRound = after.rounds[roundIndex];
  const beforeMatch = beforeRound.matches[matchIndex];
  const afterMatch = afterRound.matches[matchIndex];
  const beforeRows = relevantStandingRows(format, before, beforeRound);
  const afterRows = relevantStandingRows(format, after, afterRound);
  const preservedRoundIndexes = before.rounds
    .map((_, index) => index)
    .filter((index) => index > roundIndex);
  const lockedRoundIndexes = preservedRoundIndexes.filter((index) => (
    before.rounds[index].matches.some((match) => match.status === '已完成')
  ));

  return {
    phase: beforeRound.phase || 'preliminary',
    roundName: beforeRound.name || `Round ${roundIndex + 1}`,
    before: {
      playerA: beforeMatch.playerA,
      playerB: beforeMatch.playerB,
      scoreA: Number(beforeMatch.scoreA),
      scoreB: Number(beforeMatch.scoreB),
      winner: beforeMatch.winner,
    },
    after: {
      playerA: afterMatch.playerA,
      playerB: afterMatch.playerB,
      scoreA: Number(afterMatch.scoreA),
      scoreB: Number(afterMatch.scoreB),
      winner: afterMatch.winner,
    },
    changes: standingChanges(beforeRows, afterRows),
    preservedRoundIndexes,
    lockedRoundIndexes,
  };
}

function relevantStandingRows(format, tournament, round) {
  const withoutStoredChampion = { ...tournament, champion: null };
  const phase = round?.phase || 'preliminary';
  if (typeof format.getPhaseStandings === 'function') {
    return format.getPhaseStandings(withoutStoredChampion, phase);
  }
  return format.getStandings(withoutStoredChampion);
}

function standingChanges(beforeRows, afterRows) {
  const before = new Map((beforeRows || []).map((row) => [row.player, row]));
  const after = new Map((afterRows || []).map((row) => [row.player, row]));
  return [...new Set([...before.keys(), ...after.keys()])].map((player) => {
    const left = before.get(player) || {};
    const right = after.get(player) || {};
    return {
      player,
      winsBefore: Number(left.wins) || 0,
      winsAfter: Number(right.wins) || 0,
      lossesBefore: Number(left.losses) || 0,
      lossesAfter: Number(right.losses) || 0,
      pointsBefore: Number(left.totalPoints) || 0,
      pointsAfter: Number(right.totalPoints) || 0,
      rankBefore: Number(left.rank) || null,
      rankAfter: Number(right.rank) || null,
    };
  }).filter((row) => (
    row.winsBefore !== row.winsAfter
    || row.lossesBefore !== row.lossesAfter
    || row.pointsBefore !== row.pointsAfter
    || row.rankBefore !== row.rankAfter
  ));
}

function protectedStandingSignature(format, tournament, round) {
  const withoutStoredChampion = { ...tournament, champion: null };
  const overall = standingSignature(format.getStandings(withoutStoredChampion));
  if (typeof format.getPhaseStandings !== 'function') return overall;
  const phase = round?.phase || 'preliminary';
  const phaseRows = format.getPhaseStandings(withoutStoredChampion, phase);
  return `${overall}||${phase}:${standingSignature(phaseRows)}`;
}

function standingSignature(rows) {
  return (rows || []).map((row) => `${row.player}:${row.rank ?? ''}`).join('|');
}

function safeImpact(tournament, preview) {
  return { level: 0, safe: true, repairable: false, message: '比分可安全修正。', tournament, preview };
}

function repairableImpact(tournament, preview, message) {
  return { level: 1, safe: false, repairable: true, message, tournament, preview };
}

function blockedImpact(level, message, preview = null) {
  return { level, safe: false, repairable: false, message, tournament: null, preview };
}

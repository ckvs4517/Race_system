/** Formal match result, replay, forfeit, and withdrawal operations. */
import { getTournamentFormat } from '../../formats/registry.js';
import { recordLegacyResult } from './legacy-bracket.js';
import { normalizeTournament } from './normalization.js';
import { validateFinalScore } from './score-validation.js';

export function resetCompletedMatch(tournament, roundIndex, matchIndex) {
  // 回退前段比賽時捨棄後續輪次，避免舊勝者污染新的晉級路線。
  const normalized = normalizeTournament(tournament);
  if (normalized.bracketVersion !== 2) throw new Error('舊版進行中賽事不支援回退比賽。');
  if (normalized.status !== '進行中' && normalized.status !== '已完成') throw new Error('這場賽事目前不能重新比賽。');
  const rounds = structuredClone(normalized.rounds.slice(0, roundIndex + 1));
  const resetRound = rounds[roundIndex];
  const match = resetRound?.matches[matchIndex];
  if (!match || match.status !== '已完成') throw new Error('只有已完成的比賽可以重新開始。');

  match.scoreA = null;
  match.scoreB = null;
  match.winner = null;
  match.status = '可開始';
  delete match.completedAt;
  delete match.outcome;
  delete match.forfeitPlayer;
  delete match.resolutionReason;
  const format = getTournamentFormat(normalized.format);
  const resetPhase = resetRound?.phase || 'preliminary';
  const swissStage = normalized.format === 'swiss'
    ? resetPhase === 'preliminary' ? 'preliminary' : resetPhase
    : undefined;
  return {
    ...normalized,
    rounds,
    playerStats: format.rebuildStats(normalized.players, rounds),
    champion: null,
    status: '進行中',
    ...(swissStage ? {
      swissStage,
      finalists: swissStage === 'preliminary' ? [] : normalized.finalists,
      swissFinalMode: swissStage === 'preliminary' ? null : normalized.swissFinalMode,
      activeQualifierSeriesId: swissStage === 'qualifier' ? resetRound.seriesId : normalized.activeQualifierSeriesId,
    } : {}),
    updatedAt: new Date().toISOString(),
  };
}

export function recordMatchResult(tournament, roundIndex, matchIndex, scoreA, scoreB, random = Math.random) {
  const normalized = normalizeTournament(tournament);
  if (normalized.status !== '進行中') throw new Error('賽事尚未開始或已經完成。');
  validateFinalScore(scoreA, scoreB);
  if (normalized.bracketVersion === 1) return recordLegacyResult(normalized, roundIndex, matchIndex, scoreA, scoreB);

  const format = getTournamentFormat(normalized.format);
  const result = format.recordResult(normalized, roundIndex, matchIndex, scoreA, scoreB, random);
  return {
    ...normalized,
    ...result,
    status: result.champion || result.swissStage === 'completed' ? '已完成' : '進行中',
  };
}

export function forfeitMatch(tournament, roundIndex, matchIndex, forfeitingPlayer, reason = '選手棄賽') {
  const normalized = normalizeTournament(tournament);
  return settleAdministrativeMatch(normalized, roundIndex, matchIndex, forfeitingPlayer, 'forfeit', reason);
}

export function withdrawPlayer(tournament, player, status = 'withdrawn') {
  // 退賽不可逆；若目前有待比賽對手，立即以 4：0 行政判定。
  const normalized = normalizeTournament(tournament);
  if (normalized.status !== '進行中') throw new Error('只有進行中的賽事可以標記選手退賽。');
  if (normalized.bracketVersion !== 2) throw new Error('舊版進行中賽事不支援選手退賽。');
  if (!normalized.players.includes(player)) throw new Error('找不到這位選手。');
  if (!['withdrawn', 'no_show'].includes(status)) throw new Error('不支援的退賽狀態。');
  if (normalized.participantStates[player]?.status !== 'active') throw new Error('這位選手已經退出賽事。');
  if (normalized.format === 'single_elimination' && (normalized.playerStats?.[player]?.losses || 0) > 0) throw new Error('這位選手已經在單淘汰賽中遭到淘汰。');

  const reason = status === 'no_show' ? '選手未出席' : '選手中途退賽';
  const participantStates = {
    ...normalized.participantStates,
    [player]: { status, reason, updatedAt: new Date().toISOString() },
  };
  const marked = { ...normalized, participantStates, updatedAt: new Date().toISOString() };
  const pending = findPendingMatch(marked, player);
  if (!pending) return marked;
  return settleAdministrativeMatch(marked, pending.roundIndex, pending.matchIndex, player, 'withdrawal', reason);
}

function settleAdministrativeMatch(tournament, roundIndex, matchIndex, forfeitingPlayer, outcome, reason) {
  // 行政判定仍走一般記分流程，確保晉級、統計與下一輪只維護一套邏輯。
  const match = tournament.rounds[roundIndex]?.matches[matchIndex];
  if (!match || match.status !== '可開始') throw new Error('這場比賽目前無法判定棄賽。');
  if (![match.playerA, match.playerB].includes(forfeitingPlayer)) throw new Error('棄賽選手不在這場比賽中。');
  const scoreA = match.playerA === forfeitingPlayer ? 0 : 4;
  const scoreB = match.playerB === forfeitingPlayer ? 0 : 4;
  const result = recordMatchResult(tournament, roundIndex, matchIndex, scoreA, scoreB);
  const completed = result.rounds[roundIndex].matches[matchIndex];
  completed.outcome = outcome;
  completed.forfeitPlayer = forfeitingPlayer;
  completed.resolutionReason = reason;
  return result;
}

function findPendingMatch(tournament, player) {
  for (let roundIndex = tournament.rounds.length - 1; roundIndex >= 0; roundIndex -= 1) {
    const matchIndex = tournament.rounds[roundIndex].matches.findIndex((match) => match.status === '可開始' && [match.playerA, match.playerB].includes(player));
    if (matchIndex >= 0) return { roundIndex, matchIndex };
  }
  return null;
}

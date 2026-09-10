/** Safe historical score correction analysis. Level 1/2 Repair is deliberately deferred. */
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

  if (correctedWinner !== originalWinner) {
    if (normalized.format === 'single_elimination') {
      return blockedImpact(2, '此修改會改變單淘汰賽晉級結果，目前版本不支援這類 Repair Flow。');
    }
    if (normalized.format === 'win_streak') {
      return blockedImpact(1, '此修改會改變守擂勝者或連勝狀態，需要 Repair Flow；目前版本尚未支援。');
    }
    return blockedImpact(1, '此比分修正會改變勝者與賽事戰績，需要 Repair Flow；目前版本尚未支援。');
  }

  // 單淘汰只要 winner / bracket path 不變，比分數字本身可安全修正。
  if (normalized.format === 'single_elimination') return safeImpact(candidate);

  // Swiss / Round Robin / Win Streak 可能把得失分當成排名依據；不能只檢查 winner。
  const beforeSignature = protectedStandingSignature(format, normalized, round);
  const afterSignature = protectedStandingSignature(format, candidate, rounds[roundIndex]);
  if (beforeSignature !== afterSignature) {
    return blockedImpact(1, '此比分修正會改變目前排名或賽事狀態，需要 Repair Flow；目前版本尚未支援。');
  }

  return safeImpact(candidate);
}

export function correctMatchScore(tournament, roundIndex, matchIndex, scoreA, scoreB) {
  const impact = analyzeMatchScoreCorrection(tournament, roundIndex, matchIndex, scoreA, scoreB);
  if (impact.level !== 0) throw new Error(impact.message);
  return { ...impact.tournament, updatedAt: new Date().toISOString() };
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

function safeImpact(tournament) {
  return { level: 0, safe: true, message: '比分可安全修正。', tournament };
}

function blockedImpact(level, message) {
  return { level, safe: false, message, tournament: null };
}

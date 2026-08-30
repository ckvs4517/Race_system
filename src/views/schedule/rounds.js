/** 輪次、戰鬥台分組與對戰卡片畫面。 */
import { escapeText } from './html-escape.js';

export function currentRoundEntries(tournament, projectedRounds, isSwiss) {
  const entries = projectedRounds.map((round, roundIndex) => ({ round, roundIndex }));
  if (tournament.status === '準備中' || tournament.status === '排程中') return entries;

  if (isSwiss && tournament.swissStage === 'qualification') return [];

  const activeEntry = entries.find(({ round }) => round.matches.some((match) => match.status === '可開始'));
  if (activeEntry) return [activeEntry];

  if (isSwiss) {
    const phase = tournament.swissStage === 'qualifier'
      ? 'qualifier'
      : ['final', 'completed'].includes(tournament.swissStage) ? 'final' : 'preliminary';
    const seriesId = phase === 'qualifier' ? tournament.activeQualifierSeriesId : null;
    const phaseEntries = entries.filter(({ round }) => (round.phase || 'preliminary') === phase
      && (!seriesId || round.seriesId === seriesId));
    return phaseEntries.length ? [phaseEntries.at(-1)] : [];
  }

  const storedRounds = Array.isArray(tournament.rounds) ? tournament.rounds.length : 0;
  return storedRounds ? [entries[Math.min(storedRounds - 1, entries.length - 1)]] : [];
}

export function roundPhaseLabel(round, roundIndex) {
  const phase = round.phase || 'preliminary';
  if (phase === 'qualifier') return 'QUALIFIER';
  if (phase === 'placement') return 'TIE BREAK';
  if (round.seriesId === 'stage2-swiss' || String(round.name || '').includes('第二階段')) return 'STAGE 2';
  if (phase === 'final') return 'TOP 4 FINAL';
  return `ROUND ${String(roundIndex + 1).padStart(2, '0')}`;
}

export function roundColumnView(tournament, round, roundIndex, canManage, isDraft, seedNames, isSwiss, arenaCount) {
  const completed = round.matches.every((match) => ['已完成', '輪空晉級'].includes(match.status));
  const toggle = completed ? '<i class="round-toggle" aria-hidden="true"></i>' : '';
  return `<details class="round-column ${completed ? 'is-completed' : ''} ${arenaCount > 1 ? 'has-battle-stations' : ''}" style="--station-count:${arenaCount}" ${completed ? '' : 'open'}>
    <summary class="round-heading"><span>${roundPhaseLabel(round, roundIndex)}</span><b>${escapeText(round.name)}</b>${toggle}</summary>
    <div class="round-matches ${isSwiss && roundIndex > 0 ? 'has-score-groups' : ''}">${roundMatchesView(tournament, round, roundIndex, canManage && !isDraft, canManage && tournament.bracketVersion === 2, seedNames, isSwiss, arenaCount)}</div>
  </details>`;
}

function roundMatchesView(tournament, round, roundIndex, scoringEnabled, replayEnabled, seedNames, isSwiss, arenaCount) {
  const entries = round.matches.map((match, matchIndex) => ({ match, matchIndex }));
  if (arenaCount === 1) return scoreGroupedMatchesView(tournament, round, roundIndex, entries, scoringEnabled, replayEnabled, seedNames, isSwiss);

  // 依比賽順序輪流分配戰鬥台，讓各台場數最多只差一場。
  const stations = Array.from({ length: arenaCount }, () => []);
  entries.forEach((entry, index) => stations[index % arenaCount].push(entry));
  return `<div class="battle-stations">${stations.map((stationEntries, stationIndex) => `<section class="battle-station"><div class="battle-station-title"><span>戰鬥台 ${stationIndex + 1}</span><i>${stationEntries.length ? `${stationEntries.length} 場對戰` : '本輪待命'}</i></div>${stationEntries.length ? scoreGroupedMatchesView(tournament, round, roundIndex, stationEntries, scoringEnabled, replayEnabled, seedNames, isSwiss) : '<div class="battle-station-empty">本輪沒有分配對戰</div>'}</section>`).join('')}</div>`;
}

function scoreGroupedMatchesView(tournament, round, roundIndex, entries, scoringEnabled, replayEnabled, seedNames, isSwiss) {
  if (!isSwiss || roundIndex === 0 || (round.phase || 'preliminary') !== 'preliminary') return `<div class="station-match-list">${entries.map(({ match, matchIndex }) => matchCard(match, roundIndex, matchIndex, scoringEnabled, replayEnabled, seedNames, round.seedReason, isSwiss, tournament.status)).join('')}</div>`;

  const groups = new Map();
  entries.forEach((entry) => {
    const label = swissGroupLabel(tournament, roundIndex, entry.match);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(entry);
  });
  return [...groups].map(([label, matches]) => `<section class="swiss-score-group"><div class="swiss-score-group-title"><span>${escapeText(label)}</span><i>${matches.length} 場對戰</i></div><div class="swiss-score-group-matches">${matches.map(({ match, matchIndex }) => matchCard(match, roundIndex, matchIndex, scoringEnabled, replayEnabled, seedNames, round.seedReason, isSwiss, tournament.status)).join('')}</div></section>`).join('');
}

function swissGroupLabel(tournament, roundIndex, match) {
  const wins = Object.fromEntries((tournament.players || []).map((player) => [player, 0]));
  (tournament.rounds || []).slice(0, roundIndex).forEach((round) => round.matches.forEach((previousMatch) => {
    if (previousMatch.winner && previousMatch.winner !== '輪空') wins[previousMatch.winner] = (wins[previousMatch.winner] || 0) + 1;
  }));
  const winsA = wins[match.playerA] || 0;
  const winsB = match.playerB === '輪空' ? winsA : wins[match.playerB] || 0;
  if (roundIndex === 1 && winsA === winsB) return winsA === 1 ? '勝者組' : '敗者組';
  if (winsA === winsB) return `${winsA} 勝組`;
  return `${Math.max(winsA, winsB)} 勝／${Math.min(winsA, winsB)} 勝跨組配對`;
}

function matchCard(match, roundIndex, matchIndex, scoringEnabled, replayEnabled, seedNames, seedReason, isSwiss, tournamentStatus) {
  const interactive = scoringEnabled && tournamentStatus === '進行中' && match.status === '可開始';
  const scoreA = match.scoreA ?? '—';
  const scoreB = match.scoreB ?? '—';
  const displayStatus = match.outcome === 'withdrawal'
    ? '退賽判定 4：0'
    : match.outcome === 'forfeit'
      ? '棄賽判定 4：0'
      : match.status === '輪空晉級' && isSwiss
    ? (scoringEnabled ? '輪空得勝' : '預定輪空')
    : scoringEnabled && match.status === '輪空晉級' && seedReason === 'performance'
    ? '表現種子晉級'
    : scoringEnabled && match.status === '輪空晉級' && seedReason === 'random'
      ? '隨機種子晉級'
      : !scoringEnabled && match.status === '輪空晉級'
    ? '預定輪空'
    : match.status === '可開始' && tournamentStatus === '已完成' ? '未進行（賽事已結束）'
    : !scoringEnabled && match.status === '可開始' ? '等待賽事開始' : match.status;
  const content = `<div class="match-meta"><span>MATCH ${String(matchIndex + 1).padStart(2, '0')}</span><i>${displayStatus}</i></div><div class="competitor ${match.playerA === '輪空' || match.playerA === '待定' ? 'muted' : ''} ${scoringEnabled && match.winner === match.playerA ? 'winner' : ''} ${match.forfeitPlayer === match.playerA ? 'administrative-loser' : ''}"><span>${escapeText(match.playerA)}${seedNames.has(match.playerA) ? '<small>SEED</small>' : ''}${match.forfeitPlayer === match.playerA ? `<small>${match.outcome === 'withdrawal' ? '退賽' : '棄賽'}</small>` : ''}</span><b>${scoreA}</b></div><div class="competitor ${match.playerB === '輪空' || match.playerB === '待定' ? 'muted' : ''} ${scoringEnabled && match.winner === match.playerB ? 'winner' : ''} ${match.forfeitPlayer === match.playerB ? 'administrative-loser' : ''}"><span>${escapeText(match.playerB)}${seedNames.has(match.playerB) ? '<small>SEED</small>' : ''}${match.forfeitPlayer === match.playerB ? `<small>${match.outcome === 'withdrawal' ? '退賽' : '棄賽'}</small>` : ''}</span><b>${scoreB}</b></div>`;
  if (interactive) return `<button class="match-card is-ready" data-round-index="${roundIndex}" data-match-index="${matchIndex}">${content}</button>`;
  if (scoringEnabled && match.status === '已完成') return `<article class="match-card is-complete">${content}${replayEnabled && match.outcome !== 'withdrawal' ? `<button class="match-replay" data-replay-round="${roundIndex}" data-replay-match="${matchIndex}">重新比賽</button>` : ''}</article>`;
  return `<article class="match-card">${content}</article>`;
}

export function swissRoundArenaCount(tournament, round, arenaCount) {
  if (tournament.swissStage2Config && ['final', 'placement'].includes(round.phase)) return arenaCount;
  return round.phase === 'final' ? 1 : arenaCount;
}

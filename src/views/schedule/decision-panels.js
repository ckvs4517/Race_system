/** 瑞士制結算、四強決賽與循環賽同分決策面板。 */
import { getSwissPhaseStandings, getTournamentStandings } from '../../domain/tournament.js';
import { escapeAttribute, escapeText } from './html-escape.js';

export function swissDecisionPanel(tournament, canManage) {
  const configuredStage2 = readSwissStage2Config(tournament);
  if (configuredStage2) return configuredSwissDecisionPanel(tournament, canManage, configuredStage2);
  const stage = tournament.swissStage || 'preliminary';
  if (stage === 'preliminary') return '';
  if (stage === 'qualifier') {
    const qualifierRows = getSwissPhaseStandings(tournament, 'qualifier');
    return `<section class="swiss-decision-panel"><p class="kicker">QUALIFIER</p><h2>資格積分決定賽進行中</h2><p>完成全部資格加賽後，系統會回到四強資格確認。</p>${swissMiniStandings(qualifierRows)}</section>`;
  }
  if (stage === 'final') {
    const isKnockout = tournament.swissFinalMode === 'single_elimination';
    const activeTieBreakRound = !isKnockout && tournament.finalTie
      ? [...(tournament.rounds || [])].reverse().find((round) => round.phase === 'final'
        && String(round.seriesId || '').startsWith('final-tiebreak-')
        && round.matches.some((match) => ['可開始', '等待前輪'].includes(match.status)))
      : null;
    const isAutomaticTieBreak = Boolean(activeTieBreakRound);
    const displayPlayers = isAutomaticTieBreak ? activeTieBreakRound.seriesPlayers || [] : tournament.finalists || [];
    const title = isAutomaticTieBreak ? '四強同分加賽進行中' : isKnockout ? '前四名單淘汰決賽' : '前四名循環決賽';
    const description = isAutomaticTieBreak
      ? '四強循環決賽出現三人以上完全同分，系統已依規則自動建立循環加賽；完成後若仍無法分出唯一第一名，會再自動建立下一組加賽。'
      : isKnockout
        ? '依瑞士輪排名進行第 1 對第 4、第 2 對第 3 的準決賽；其後同時進行冠軍賽與季軍賽，統一使用戰鬥台 1。'
        : '四位選手統一使用戰鬥台 1，各互打一場，共三輪、六場；依勝場、敗場、總得分排序，兩人完全同分時以直接對戰結果決定名次。';
    return `<section class="swiss-decision-panel"><p class="kicker">${isAutomaticTieBreak ? 'AUTOMATIC TIE BREAK' : 'TOP 4 FINAL'}</p><h2>${title}</h2><p>${description}</p><div class="swiss-finalists">${displayPlayers.map((player) => `<span>${escapeText(player)}</span>`).join('')}</div></section>`;
  }
  if (stage === 'completed') return '';

  const rows = getTournamentStandings(tournament);
  const latestQualifier = tournament.qualifierSeriesCount ? getSwissPhaseStandings(tournament, 'qualifier') : [];
  const directFinalRows = getDirectFinalRows(rows, latestQualifier);
  const needsQualifier = !latestQualifier.length && hasTopFourTie(rows);
  if (!canManage) {
    return `<section class="swiss-decision-panel"><p class="kicker">SWISS FINISH</p><h2>瑞士輪結算確認中</h2><p>${needsQualifier ? '四強資格線有同分選手；主辦方可安排資格積分決定賽，或直接以積分榜結束。' : '主辦方正在選擇以積分榜結束、前四循環決賽或前四單淘汰決賽。'}</p></section>`;
  }
  const qualifierChoices = swissPlayerChoices(rows, 'candidate');
  const directFinalChoices = swissPlayerChoices(directFinalRows, 'finalist', true);
  return `<section class="swiss-decision-panel">
    <p class="kicker">SWISS FINISH</p><h2>瑞士輪結算方式</h2>
    <p>${needsQualifier ? '四強資格線出現同分，前四名超過 4 位。可安排資格積分決定賽；也可以直接以目前積分榜結束賽事。' : '前四名資格已明確。可直接以積分榜結束，或確認四強後選擇決賽賽制。'}</p>
    ${latestQualifier.length ? `<div class="swiss-latest-qualifier"><h3>最近一組資格加賽結果</h3>${swissMiniStandings(latestQualifier)}</div>` : ''}
    <div class="swiss-decision-grid ${needsQualifier ? '' : 'is-direct-only'}">
      ${needsQualifier ? `<form data-swiss-qualifier-form><h3>資格積分決定賽</h3><div class="swiss-player-choices">${qualifierChoices}</div><button class="button button-secondary" type="submit">建立資格加賽</button></form>` : ''}
      <form data-swiss-final-form><h3>確認四強並建立決賽</h3><p class="swiss-choice-note">只列出目前排行榜前四名；確認後請選擇後續賽制。</p><div class="swiss-player-choices">${directFinalChoices}</div><fieldset class="swiss-final-mode-options"><legend>四強賽制</legend><label><input type="radio" name="swissFinalMode" value="round_robin" checked><span><b>循環決賽</b><small>四人互打，共三輪、六場。</small></span></label><label><input type="radio" name="swissFinalMode" value="single_elimination"><span><b>單淘汰決賽</b><small>第 1 對第 4、第 2 對第 3，另有季軍賽。</small></span></label></fieldset><button class="button button-primary" type="submit">建立四強決賽</button></form>
    </div>
    <div class="swiss-standings-finish"><div><h3>以積分榜直接結束</h3><p>不建立四強賽程，四輪瑞士輪排名即為最終成績；若同分會保留並列名次。</p></div>${canManage ? '<button class="button button-secondary" data-complete-swiss-standings>以積分榜結束賽事</button>' : ''}</div>
  </section>`;
}

export function roundRobinTieBreakPanel(tournament, canManage) {
  if (tournament.roundRobinStage !== 'tied') return '';
  const rows = getTournamentStandings(tournament);
  const tiedGroups = new Map();
  rows.forEach((row) => { if (!tiedGroups.has(row.rank)) tiedGroups.set(row.rank, []); tiedGroups.get(row.rank).push(row); });
  const choices = [...tiedGroups.values()].filter((group) => group.length > 1 && group[0].rank === 1)
    .map((group) => `<div class="swiss-player-choices"><p class="swiss-choice-note">並列第一名</p>${group.map((row) => `<label class="swiss-player-choice"><input type="checkbox" name="candidate" value="${escapeAttribute(row.player)}"><span><b>${escapeText(row.player)}</b><small>${row.wins} 勝 ${row.losses} 敗 · 總得分 ${row.totalPoints}</small></span></label>`).join('')}</div>`).join('');
  if (!choices) return '';
  return `<section class="swiss-decision-panel"><p class="kicker">TIE BREAK</p><h2>並列冠軍確認</h2><p>目前第一名的勝場與總得分完全相同，因此先以並列冠軍顯示。主辦方可選擇這組選手建立循環加賽，決定唯一冠軍。</p>${canManage ? `<form data-round-robin-tiebreak-form>${choices}<button class="button button-primary" type="submit">建立冠軍加賽</button></form>` : '<p>主辦方可視需要建立冠軍加賽。</p>'}</section>`;
}

export function swissStageGuide(tournament) {
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

export function swissChampionLabel(tournament) {
  if (tournament.swissStage2Config) {
    if (tournament.swissFinalMode === 'swiss') return '第二階段瑞士輪第一名';
    if (tournament.swissFinalMode === 'round_robin') return '第二階段循環賽第一名';
    if (tournament.swissFinalMode === 'single_elimination') return '第二階段單淘汰冠軍';
  }
  if (tournament.swissFinalMode === 'single_elimination') return '四強單淘汰賽冠軍';
  if (tournament.swissFinalMode === 'standings') return '瑞士輪積分榜第一名';
  return '四強循環賽第一名';
}

function hasTopFourTie(rows) {
  return rows.filter((row) => row.rank <= 4).length > 4;
}

function swissPlayerChoices(rows, name, checked = false) {
  return rows.map((row) => `<label class="swiss-player-choice"><input type="checkbox" name="${name}" value="${escapeAttribute(row.player)}" ${checked ? 'checked' : ''}><span><b>${escapeText(row.player)}</b><small>${row.wins} 勝 ${row.losses} 敗 · 總得分 ${row.totalPoints}</small></span></label>`).join('');
}

function getDirectFinalRows(preliminaryRows, latestQualifierRows) {
  if (!latestQualifierRows.length) return preliminaryRows.slice(0, 4);
  const qualifierPlayers = new Set(latestQualifierRows.map((row) => row.player));
  const automaticRows = preliminaryRows.slice(0, 4).filter((row) => !qualifierPlayers.has(row.player));
  const openSlots = Math.max(0, 4 - automaticRows.length);
  return [...automaticRows, ...latestQualifierRows.slice(0, openSlots)];
}

function swissMiniStandings(rows) {
  return `<div class="swiss-mini-standings">${rows.map((row) => `<div><b>${row.rank}</b><span>${escapeText(row.player)}</span><i>${row.wins} 勝 ${row.losses} 敗</i><strong>總得分 ${row.totalPoints}</strong></div>`).join('')}</div>`;
}

function readSwissStage2Config(tournament) {
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
    return `<section class="swiss-decision-panel"><p class="kicker">QUALIFIER</p><h2>第二階段資格加賽進行中</h2><p>只處理跨越 Top ${config.advanceCount} 晉級切線的同分選手；完成後系統會重新檢查剩餘名額。</p>${swissMiniStandings(qualifierRows)}</section>`;
  }
  if (stage === 'final') {
    const activePlacement = [...(tournament.rounds || [])].reverse().find((round) => round.phase === 'placement'
      && round.matches.some((match) => ['可開始', '等待前輪'].includes(match.status)));
    const isSwiss = tournament.swissFinalMode === 'swiss';
    const isRoundRobin = tournament.swissFinalMode === 'round_robin';
    const activeRoundRobinTieBreak = isRoundRobin
      ? [...(tournament.rounds || [])].reverse().find((round) => round.phase === 'final'
        && String(round.seriesId || '').startsWith('final-tiebreak-')
        && round.matches.some((match) => ['可開始', '等待前輪'].includes(match.status)))
      : null;
    const displayPlayers = activePlacement?.seriesPlayers || activeRoundRobinTieBreak?.seriesPlayers || tournament.finalists || [];
    const title = activePlacement
      ? '冠亞名次加賽進行中'
      : activeRoundRobinTieBreak
        ? `Top ${config.advanceCount} 第二階段同分加賽進行中`
        : isSwiss
          ? `Top ${config.advanceCount} 第二階段瑞士輪`
          : isRoundRobin
            ? `Top ${config.advanceCount} 第二階段循環賽`
            : `Top ${config.advanceCount} 第二階段單淘汰`;
    const description = activePlacement
      ? '第二階段完成後冠亞關鍵名次仍完全同分；加賽只決定冠亞位置，不回寫第二階段原始積分。'
      : activeRoundRobinTieBreak
        ? '第二階段循環賽第一名仍完全同分，系統已自動建立循環加賽；若完成後仍無法分出唯一第一名，會再建立下一組加賽。'
        : isSwiss
          ? `${config.advanceCount} 位晉級者積分歸零重新開始，共打 ${config.rounds} 輪；第一階段配對歷史不帶入第二階段。`
          : isRoundRobin
            ? `${config.advanceCount} 位晉級者每人互打一場，共 ${config.advanceCount - 1} 輪、${config.advanceCount * (config.advanceCount - 1) / 2} 場。`
            : `依第一階段排名種子進行 Top ${config.advanceCount} 單淘汰，直到產生冠軍。`;
    return `<section class="swiss-decision-panel"><p class="kicker">${activeRoundRobinTieBreak ? 'AUTOMATIC TIE BREAK' : 'STAGE 2'}</p><h2>${title}</h2><p>${description}</p><div class="swiss-finalists">${displayPlayers.map((player) => `<span>${escapeText(player)}</span>`).join('')}</div></section>`;
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

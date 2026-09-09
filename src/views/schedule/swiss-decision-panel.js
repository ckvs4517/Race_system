/** 傳統 Swiss 結算／四強決策面板與顯示標籤。 */
import { getSwissPhaseStandings, getTournamentStandings } from '../../domain/tournament.js';
import { escapeText } from './html-escape.js';
import { configuredSwissDecisionPanel, readSwissStage2Config } from './stage2-decision-panel.js';
import { swissMiniStandings, swissPlayerChoices } from './swiss-panel-elements.js';

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

function getDirectFinalRows(preliminaryRows, latestQualifierRows) {
  if (!latestQualifierRows.length) return preliminaryRows.slice(0, 4);
  const qualifierPlayers = new Set(latestQualifierRows.map((row) => row.player));
  const automaticRows = preliminaryRows.slice(0, 4).filter((row) => !qualifierPlayers.has(row.player));
  const openSlots = Math.max(0, 4 - automaticRows.length);
  return [...automaticRows, ...latestQualifierRows.slice(0, openSlots)];
}

/** Configurable Swiss Stage 2 決策面板與設定解析。 */
import { getSwissPhaseStandings, getTournamentStandings } from '../../domain/tournament.js';
import { escapeText } from './html-escape.js';
import { swissMiniStandings, swissPlayerChoices } from './swiss-panel-elements.js';

export function readSwissStage2Config(tournament) {
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

export function configuredSwissDecisionPanel(tournament, canManage, config) {
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

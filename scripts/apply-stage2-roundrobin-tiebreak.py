from pathlib import Path


def replace_once(path, old, new):
    file = Path(path)
    text = file.read_text(encoding='utf-8')
    if old not in text:
        raise RuntimeError(f'Expected block not found in {path}: {old[:120]!r}')
    file.write_text(text.replace(old, new, 1), encoding='utf-8')

# Domain label: legacy four-player events keep the old name; configured Stage 2 uses Top N wording.
replace_once(
    'src/formats/swiss.js',
    '''        rounds.push(...createRoundRobinRounds(
          tiedPlayers,
          'final',
          `final-tiebreak-${seriesNumber}`,
          `四強同分加賽 ${seriesNumber}`,
        ));''',
    '''        const tieBreakLabel = tournament.swissStage2Config
          ? `Top ${normalizeSwissStage2Config(tournament.swissStage2Config).advanceCount} 第二階段同分加賽 ${seriesNumber}`
          : `四強同分加賽 ${seriesNumber}`;
        rounds.push(...createRoundRobinRounds(
          tiedPlayers,
          'final',
          `final-tiebreak-${seriesNumber}`,
          tieBreakLabel,
        ));'''
)

# Configured Stage 2 UI explicitly surfaces an active automatic round-robin tie-break.
schedule = 'src/views/schedule.js'
replace_once(
    schedule,
    '''    const activePlacement = [...(tournament.rounds || [])].reverse().find((round) => round.phase === 'placement'
      && round.matches.some((match) => ['可開始', '等待前輪'].includes(match.status)));
    const displayPlayers = activePlacement?.seriesPlayers || tournament.finalists || [];
    const isSwiss = tournament.swissFinalMode === 'swiss';
    const isRoundRobin = tournament.swissFinalMode === 'round_robin';''',
    '''    const activePlacement = [...(tournament.rounds || [])].reverse().find((round) => round.phase === 'placement'
      && round.matches.some((match) => ['可開始', '等待前輪'].includes(match.status)));
    const isSwiss = tournament.swissFinalMode === 'swiss';
    const isRoundRobin = tournament.swissFinalMode === 'round_robin';
    const activeRoundRobinTieBreak = isRoundRobin
      ? [...(tournament.rounds || [])].reverse().find((round) => round.phase === 'final'
        && String(round.seriesId || '').startsWith('final-tiebreak-')
        && round.matches.some((match) => ['可開始', '等待前輪'].includes(match.status)))
      : null;
    const displayPlayers = activePlacement?.seriesPlayers || activeRoundRobinTieBreak?.seriesPlayers || tournament.finalists || [];'''
)
replace_once(
    schedule,
    '''    const title = activePlacement
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
    return `<section class="swiss-decision-panel"><p class="kicker">STAGE 2</p><h2>${title}</h2><p>${description}</p><div class="swiss-finalists">${displayPlayers.map((player) => `<span>${escapeText(player)}</span>`).join('')}</div></section>`;''',
    '''    const title = activePlacement
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
    return `<section class="swiss-decision-panel"><p class="kicker">${activeRoundRobinTieBreak ? 'AUTOMATIC TIE BREAK' : 'STAGE 2'}</p><h2>${title}</h2><p>${description}</p><div class="swiss-finalists">${displayPlayers.map((player) => `<span>${escapeText(player)}</span>`).join('')}</div></section>`;'''
)

# Regression: a configured Top 8 round-robin tie-break must not fall back to "四強" wording.
test = 'tests/swiss.test.mjs'
replace_once(
    test,
    '''assert.equal(top8RoundRobin.rounds.filter((round) => round.phase === 'final').flatMap((round) => round.matches).length, 28, 'Top8 循環應建立 28 場');

const multiArena''',
    '''assert.equal(top8RoundRobin.rounds.filter((round) => round.phase === 'final').flatMap((round) => round.matches).length, 28, 'Top8 循環應建立 28 場');
const top8TieBreakPreview = {
  ...top8RoundRobin,
  finalTie: true,
  rounds: [...top8RoundRobin.rounds, {
    name: 'Top 8 第二階段同分加賽 1－第 1 輪',
    phase: 'final',
    phaseRound: 1,
    seriesId: 'final-tiebreak-1',
    seriesPlayers: top8Players.slice(0, 2),
    matches: [{ id: 'preview-tie', playerA: top8Players[0], playerB: top8Players[1], scoreA: null, scoreB: null, winner: null, status: '可開始' }],
  }],
};
const top8TieBreakPreviewView = scheduleView([top8TieBreakPreview], top8TieBreakPreview.id, true);
assert.match(top8TieBreakPreviewView, /Top 8 第二階段同分加賽進行中/);
assert.match(top8TieBreakPreviewView, /AUTOMATIC TIE BREAK/);

const multiArena'''
)

print('Top 8 round-robin tie-break patch applied')

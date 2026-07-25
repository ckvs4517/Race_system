/** 將完整賽事歷史繪製成不受目前畫面折疊或隱藏影響的高解析 PNG。 */
export function createTournamentImageModel(tournament) {
  return {
    name: tournament.name || 'Spin League 賽事',
    format: tournament.format === 'swiss' ? '四輪瑞士制＋四強循環決賽' : '單淘汰賽',
    eventDate: formatEventDate(tournament.eventInfo?.date),
    venue: tournament.eventInfo?.venueName || '',
    champion: tournament.champion || '',
    playerCount: tournament.players?.length || 0,
    rounds: (tournament.rounds || []).map((round, roundIndex) => ({
      name: round.name || `第 ${roundIndex + 1} 輪`,
      phase: phaseLabel(round, roundIndex),
      matches: (round.matches || []).map((match, matchIndex) => ({
        code: `M${String(matchIndex + 1).padStart(2, '0')}`,
        playerA: match.playerA || '待定',
        playerB: match.playerB || '待定',
        scoreA: displayScore(match, 'A'),
        scoreB: displayScore(match, 'B'),
        winner: match.winner || '',
        status: match.status || '',
      })),
    })),
  };
}

export async function downloadTournamentImage(tournament) {
  await document.fonts?.ready;
  const model = createTournamentImageModel(tournament);
  const width = 1600;
  const padding = 72;
  const gap = 24;
  const cardHeight = 116;
  const roundHeadingHeight = 70;
  const headerHeight = 250;
  const footerHeight = 76;
  const columnWidth = (width - padding * 2 - gap) / 2;
  const roundHeights = model.rounds.map((round) => roundHeadingHeight + Math.ceil(round.matches.length / 2) * (cardHeight + gap) + 18);
  const height = headerHeight + roundHeights.reduce((sum, value) => sum + value, 0) + footerHeight;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('目前瀏覽器無法產生賽程圖片。');

  context.fillStyle = '#080b10';
  context.fillRect(0, 0, width, height);
  context.fillStyle = '#ff493d';
  context.fillRect(0, 0, 14, height);
  drawHeader(context, model, padding, width);

  let y = headerHeight;
  model.rounds.forEach((round, roundIndex) => {
    context.fillStyle = '#ff5a50';
    context.font = '800 20px "Noto Sans TC", "Microsoft JhengHei", sans-serif';
    context.fillText(round.phase, padding, y + 25);
    context.fillStyle = '#f4f6fa';
    context.font = '800 27px "Noto Sans TC", "Microsoft JhengHei", sans-serif';
    context.fillText(round.name, padding + 205, y + 27);
    context.fillStyle = '#29313d';
    context.fillRect(padding, y + 48, width - padding * 2, 2);
    y += roundHeadingHeight;

    round.matches.forEach((match, matchIndex) => {
      const column = matchIndex % 2;
      const row = Math.floor(matchIndex / 2);
      const x = padding + column * (columnWidth + gap);
      const cardY = y + row * (cardHeight + gap);
      drawMatchCard(context, match, x, cardY, columnWidth, cardHeight);
    });
    y += Math.ceil(round.matches.length / 2) * (cardHeight + gap) + 18;
    if (roundIndex < model.rounds.length - 1) {
      context.fillStyle = '#121821';
      context.fillRect(padding, y - 9, width - padding * 2, 1);
    }
  });

  context.fillStyle = '#7d8796';
  context.font = '500 18px "Noto Sans TC", "Microsoft JhengHei", sans-serif';
  context.fillText('Spin League · 完整賽程與比分紀錄', padding, height - 34);
  context.textAlign = 'right';
  context.fillText(`匯出時間 ${new Date().toLocaleString('zh-TW')}`, width - padding, height - 34);
  context.textAlign = 'left';

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('賽程圖片產生失敗，請稍後再試。');
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${safeFilename(model.name)}-完整賽程.png`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function drawHeader(context, model, padding, width) {
  context.fillStyle = '#ff493d';
  context.font = '900 22px "Noto Sans TC", "Microsoft JhengHei", sans-serif';
  context.fillText('TOURNAMENT FINAL REPORT', padding, 62);
  context.fillStyle = '#f7f8fb';
  context.font = '900 52px "Noto Sans TC", "Microsoft JhengHei", sans-serif';
  drawFittedText(context, model.name, padding, 125, width - padding * 2, 52, 30);
  context.fillStyle = '#9aa5b5';
  context.font = '600 21px "Noto Sans TC", "Microsoft JhengHei", sans-serif';
  const details = [model.format, `${model.playerCount} 位選手`, model.eventDate, model.venue].filter(Boolean).join('  ·  ');
  drawFittedText(context, details, padding, 169, width - padding * 2, 21, 15);
  if (model.champion) {
    context.fillStyle = '#f2c94c';
    context.font = '900 25px "Noto Sans TC", "Microsoft JhengHei", sans-serif';
    drawFittedText(context, `冠軍  ${model.champion}`, padding, 216, width - padding * 2, 25, 18);
  }
}

function drawMatchCard(context, match, x, y, width, height) {
  context.fillStyle = '#111720';
  roundedRect(context, x, y, width, height, 12);
  context.fill();
  context.strokeStyle = '#303a48';
  context.lineWidth = 2;
  context.stroke();

  context.fillStyle = '#778395';
  context.font = '700 16px "Noto Sans TC", "Microsoft JhengHei", sans-serif';
  context.fillText(match.code, x + 20, y + 25);
  context.textAlign = 'right';
  context.fillText(match.status, x + width - 20, y + 25);
  context.textAlign = 'left';
  context.fillStyle = '#26303c';
  context.fillRect(x + 18, y + 37, width - 36, 1);
  drawCompetitor(context, match.playerA, match.scoreA, match.winner === match.playerA, x + 20, y + 67, width - 40);
  drawCompetitor(context, match.playerB, match.scoreB, match.winner === match.playerB, x + 20, y + 101, width - 40);
}

function drawCompetitor(context, player, score, winner, x, y, width) {
  context.fillStyle = winner ? '#ffffff' : '#c5ccd6';
  context.font = `${winner ? '900' : '700'} 21px "Noto Sans TC", "Microsoft JhengHei", sans-serif`;
  drawFittedText(context, winner ? `${player}  WIN` : player, x, y, width - 58, 21, 13);
  context.fillStyle = winner ? '#f2c94c' : '#eef1f6';
  context.font = '900 24px "Noto Sans TC", "Microsoft JhengHei", sans-serif';
  context.textAlign = 'right';
  context.fillText(score, x + width, y);
  context.textAlign = 'left';
}

function drawFittedText(context, text, x, y, maxWidth, startSize, minimumSize) {
  let size = startSize;
  while (size > minimumSize && context.measureText(text).width > maxWidth) {
    size -= 1;
    context.font = context.font.replace(/\d+px/, `${size}px`);
  }
  context.fillText(text, x, y);
}

function roundedRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}

function displayScore(match, side) {
  if (match.playerB === '輪空') return side === 'A' ? '晉級' : '—';
  const value = side === 'A' ? match.scoreA : match.scoreB;
  return value == null ? '—' : String(value);
}

function phaseLabel(round, roundIndex) {
  if (round.phase === 'qualifier') return '資格加賽';
  if (round.phase === 'final') return '四強決賽';
  return `ROUND ${String(roundIndex + 1).padStart(2, '0')}`;
}

function formatEventDate(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[1]}/${match[2]}/${match[3]}` : '';
}

function safeFilename(value) {
  return String(value || 'spin-league').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').slice(0, 80);
}

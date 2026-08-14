/** 將單次工作階段的 Shoot Power 轉成可內嵌於頁面／匯出圖的 SVG 折線圖。 */
export function speedLineChartSvg(readings = [], options = {}) {
  return lineChartSvg(readings.map((item) => Number(item.shootPower)).filter(Number.isFinite), options);
}

/** 顯示單次發射時 Battle Pass 回傳的完整偵測點序列。 */
export function speedProfileChartSvg(profile = [], options = {}) {
  return lineChartSvg(profile.map(Number).filter(Number.isFinite), {
    ...options,
    ariaLabel: '本次發射偵測點折線圖',
    emptyLabel: '等待下一次發射的偵測點資料',
    xLabelPrefix: '點 ',
    lineColor: '#55d6ff',
    dotStroke: '#55d6ff',
  });
}

function lineChartSvg(values, options) {
  const width = options.width || 760;
  const height = options.height || 260;
  const pad = { top: 24, right: 22, bottom: 36, left: 58 };
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;

  if (!values.length) {
    return `<svg class="speed-line-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${options.ariaLabel || '尚無發射資料'}"><rect x="0" y="0" width="${width}" height="${height}" rx="16" fill="#090c12"/><text x="${width / 2}" y="${height / 2}" fill="#697486" text-anchor="middle" font-size="15" font-family="system-ui">${options.emptyLabel || '等待第一筆 Shoot Power'}</text></svg>`;
  }

  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const spread = Math.max(200, rawMax - rawMin);
  const min = Math.max(0, Math.floor((rawMin - spread * .12) / 100) * 100);
  const max = Math.ceil((rawMax + spread * .12) / 100) * 100 || 100;
  const xFor = (index) => pad.left + (values.length === 1 ? plotWidth / 2 : index / (values.length - 1) * plotWidth);
  const yFor = (value) => pad.top + (1 - (value - min) / Math.max(1, max - min)) * plotHeight;
  const points = values.map((value, index) => `${xFor(index).toFixed(1)},${yFor(value).toFixed(1)}`).join(' ');
  const grid = [0, .25, .5, .75, 1].map((ratio) => {
    const y = pad.top + plotHeight * ratio;
    const value = Math.round(max - (max - min) * ratio);
    return `<line x1="${pad.left}" y1="${y}" x2="${width - pad.right}" y2="${y}" stroke="#222a36" stroke-width="1"/><text x="${pad.left - 12}" y="${y + 4}" fill="#697486" text-anchor="end" font-size="11" font-family="system-ui">${formatNumber(value)}</text>`;
  }).join('');
  const lineColor = options.lineColor || '#ff493d';
  const dotStroke = options.dotStroke || lineColor;
  const dots = values.map((value, index) => `<circle cx="${xFor(index).toFixed(1)}" cy="${yFor(value).toFixed(1)}" r="${values.length <= 20 ? 3.5 : 2.3}" fill="#f5f7fa" stroke="${dotStroke}" stroke-width="2"/>`).join('');
  const xLabels = buildXLabels(values.length, xFor, height, pad.bottom, options.xLabelPrefix || '#');

  return `<svg class="speed-line-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${options.ariaLabel || 'Shoot Power 趨勢折線圖'}"><rect x="0" y="0" width="${width}" height="${height}" rx="16" fill="#090c12"/>${grid}<polyline points="${points}" fill="none" stroke="${lineColor}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>${dots}${xLabels}</svg>`;
}

function buildXLabels(count, xFor, height, bottomPadding, prefix) {
  const indexes = count <= 6
    ? Array.from({ length: count }, (_, index) => index)
    : [...new Set([0, Math.floor((count - 1) * .25), Math.floor((count - 1) * .5), Math.floor((count - 1) * .75), count - 1])];
  return indexes.map((index) => `<text x="${xFor(index).toFixed(1)}" y="${height - bottomPadding + 22}" fill="#697486" text-anchor="middle" font-size="11" font-family="system-ui">${prefix}${index + 1}</text>`).join('');
}

function formatNumber(value) {
  return Math.round(Number(value) || 0).toLocaleString('en-US');
}

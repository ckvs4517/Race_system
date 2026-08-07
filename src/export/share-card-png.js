// 此套件提供 UMD browser build；專案沒有 bundler，因此以 side-effect import
// 載入同源 vendor 檔案，再從 globalThis 讀取 API。
import '../../../node_modules/html-to-image/dist/html-to-image.js';
import { buildShareCardData, resolveShareCardPresentation } from '../domain/share-card.js';
import { shareCardAssets } from '../config/share-card-assets.js';
import { ResultShareCard } from '../views/result-share-card.js';

/**
 * 預載字型與同源素材後，將共用 DOM 模板匯出為固定 1080 × 1350 PNG。
 * html-to-image 以 SVG foreignObject 擷取 DOM；因此匯出前必須等待圖片與
 * 字型，且所有素材維持同源，避免跨來源圖片造成輸出空白或被瀏覽器封鎖。
 *
 * @param {object} tournament 已完成的賽事資料。
 * @param {string} playerName 要下載戰績圖的選手。
 * @returns {Promise<void>} PNG 下載完成後結束。
 */
export async function exportShareCardAsPng(tournament, playerName) {
  const data = buildShareCardData(tournament, playerName);
  const node = document.createElement('div');
  node.className = 'share-card-export-layer';
  node.innerHTML = ResultShareCard(data, resolveShareCardPresentation(data, shareCardAssets));
  document.body.append(node);
  try {
    node.querySelectorAll('img').forEach((image) => image.addEventListener('error', () => hideUnavailableImage(image)));
    await document.fonts?.ready;
    await Promise.all([...node.querySelectorAll('img')].map((image) => image.decode?.().catch(() => {})));
    node.querySelectorAll('img').forEach((image) => {
      if (image.complete && image.naturalWidth === 0) hideUnavailableImage(image);
    });
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const card = node.querySelector('[data-result-share-card]');
    const blob = await globalThis.htmlToImage.toBlob(card, { width: 1080, height: 1350, canvasWidth: 1080, canvasHeight: 1350, pixelRatio: 1, cacheBust: false, backgroundColor: '#080a0d' });
    if (!blob) throw new Error('戰績圖產生失敗，請再試一次。');
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `${safe(data.tournamentName)}-${safe(playerName)}-戰績圖.png`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  } finally { node.remove(); }
}

function hideUnavailableImage(image) {
  // 裝飾素材缺失時讓 CSS 背景與文字 fallback 接手，不能讓單一資源中斷整張卡片。
  image.hidden = true;
}

function safe(value) { return String(value || 'spin-league').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').slice(0, 80); }

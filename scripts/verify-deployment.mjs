/** 部署後 smoke test：確認公開網站、關鍵記分規則與賽事 API 可讀取。 */
const siteUrl = process.argv[2] || process.env.SITE_URL;

if (!siteUrl) throw new Error('請提供公開網站網址，例如：node scripts/verify-deployment.mjs https://example.com');
const baseUrl = new URL(siteUrl);
if (baseUrl.protocol !== 'https:') throw new Error('部署檢查只接受 HTTPS 網址。');

const cacheBust = Date.now();
const home = await read(`/?smoke=${cacheBust}`);
assert(home.includes('Spin League'), '首頁缺少 Spin League 標題');

const scoreboard = await read(`/src/views/scoreboard.js?smoke=${cacheBust}`);
assert(scoreboard.includes('勝方最終比分必須至少為 4 分'), '公開記分板缺少 4 分勝負驗證');
assert(scoreboard.includes('data-forfeit-player'), '公開記分板缺少棄賽判定入口');

const tournaments = await readJson(`/api/tournaments?smoke=${cacheBust}`);
assert(Array.isArray(tournaments.tournaments), '賽事 API 沒有回傳 tournaments 陣列');

console.log(`PASS production smoke: ${baseUrl.origin}`);

async function read(path) {
  const response = await fetch(new URL(path, baseUrl), { headers: { 'cache-control': 'no-cache' } });
  assert(response.ok, `${path} 回傳 HTTP ${response.status}`);
  return response.text();
}

async function readJson(path) {
  const response = await fetch(new URL(path, baseUrl), { headers: { accept: 'application/json', 'cache-control': 'no-cache' } });
  assert(response.ok, `${path} 回傳 HTTP ${response.status}`);
  return response.json();
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

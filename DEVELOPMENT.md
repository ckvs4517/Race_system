# Spin League 開發文件

這份文件提供給準備閱讀、修改或自行部署 Spin League 的開發者。一般功能介紹請先閱讀 [README.md](README.md)。

## 1. 系統組成

Spin League 採用「靜態前端＋雲端 API」架構：

```text
瀏覽器
  ├─ 原生 HTML / CSS / JavaScript ES Modules
  ├─ 公開賽程與獨立記分板
  └─ 主辦方操作
          │ HTTPS / JSON
          ▼
Cloudflare Worker
  ├─ PIN 登入與 HMAC 權杖
  ├─ 賽事 CRUD API
  └─ revision 衝突檢查
          │
          ▼
Cloudflare D1
  └─ 每場賽事一筆 JSON 資料
```

前端沒有使用 React、Vue 或建置 bundler。瀏覽器直接載入 `src/main.js`，因此修改後容易追蹤實際執行流程。

## 2. 目錄結構

```text
.
├─ index.html                 # 前端 HTML 入口
├─ src/
│  ├─ main.js                # 路由、畫面與事件協調
│  ├─ core/router.js         # hash 路由
│  ├─ data/store.js          # 前端狀態與 API 存取
│  ├─ domain/tournament.js   # 共用賽事生命週期
│  ├─ formats/               # 單淘汰與瑞士制策略
│  ├─ ui/                    # 共用框架與 SVG 圖示
│  ├─ views/                 # 各頁面的 HTML 與事件綁定
│  └─ styles/app.css         # 全站樣式與響應式規則
├─ worker/index.js           # Cloudflare Worker API
├─ .openai/
│  ├─ hosting.json           # ChatGPT Sites 專案與資源綁定
│  └─ drizzle/               # D1 migration
├─ db/schema.ts              # schema 參考
├─ tests/                    # Node 與瀏覽器測試
├─ scripts/                  # 部署後檢查
├─ build.ps1                 # Sites 建置腳本
└─ .github/workflows/        # CI 與正式站 smoke test
```

## 3. 前端資料流

`src/main.js` 是協調層，不應放入賽制演算法：

```text
使用者操作
  → main.js 事件處理
  → data/store.js 寫入雲端
  → store 更新前端狀態
  → subscribe() 通知 main.js
  → view 重新產生 HTML
```

各層責任：

- `views`：輸出 HTML、讀取表單、綁定單純 UI 事件。
- `main.js`：決定操作要呼叫哪個 store 或 domain 函式。
- `data/store.js`：管理前端狀態、登入權杖、API 與衝突重試。
- `domain/tournament.js`：管理賽事共用生命週期與資料驗證。
- `formats`：處理各賽制特有的配對、統計與排名。

## 4. 賽事資料模型

以下只列最重要的欄位；實際資料可由 `createTournament()` 產生：

```js
{
  id: 1720000000000,
  name: '夏季公開賽',
  format: 'single_elimination', // 或 swiss
  bracketVersion: 2,
  players: ['A', 'B', 'C', 'D'],
  arenaCount: 2,
  status: '準備中',             // 準備中、進行中、已完成
  revision: 1,                 // 後端多人同步版本
  participantStates: {
    A: { status: 'active' }    // active、no_show、withdrawn
  },
  rounds: [
    {
      name: '4 強',
      seedPlayer: null,
      seedReason: null,
      matches: [
        {
          id: 'r1m1',
          playerA: 'A',
          playerB: 'B',
          scoreA: null,
          scoreB: null,
          winner: null,
          status: '可開始'
        }
      ]
    }
  ],
  playerStats: {},
  champion: null
}
```

### 賽事生命週期

```text
建立賽事
  → 準備中：可改名稱、賽制、台數與名單
  → 抽種子／隨機分組
  → 賽事開始：鎖定設定
  → 進行中：記分、棄賽、退賽與重賽
  → 已完成：顯示冠軍與排行榜
```

退賽與未出席是不可逆狀態。這項限制是為了避免選手恢復後改變已生成的配對與比賽公平性。

## 5. 賽制策略

賽制由 `src/formats/registry.js` 註冊。策略物件主要提供：

- `initialSeedCount(players)`：首輪需要幾位種子。
- `createOpeningRound(players, seeds)`：建立首輪。
- `initializeStats(players)`：建立統計資料。
- `activateOpeningRound(round, stats)`：處理首輪輪空。
- `recordResult(...)`：寫入比分並決定下一輪或冠軍。
- `getStandings(tournament)`：產生排行榜。
- `rebuildStats(players, rounds)`：重賽後重新計算統計。

新增賽制時，先建立新的策略檔，再加入 registry；共用的開始、記分、退賽與重賽流程通常不需要重寫。

### 單淘汰規則

- 輸掉一場即淘汰。
- 奇數首輪抽一位隨機種子輪空。
- 後續奇數輪依平均得分、得失分差與較少輪空次數決定表現種子。
- 一般賽果勝方至少 4 分；行政判定為 4：0。

### 瑞士制規則

- 輪數為 `max(2, ceil(log2(參賽人數)))`。
- 優先配對同勝場且尚未交手的選手。
- 奇數人時優先讓排名較低且尚未輪空者輪空。
- 排名依勝場、Buchholz 對手分、得失分差、總得分與姓名決定。

## 6. API

公開端點：

| 方法 | 路徑 | 用途 |
|---|---|---|
| `GET` | `/api/tournaments` | 取得全部賽事 |
| `GET` | `/api/tournaments/:id` | 取得單一賽事 |

管理端點需要 `Authorization: Bearer <token>`：

| 方法 | 路徑 | 用途 |
|---|---|---|
| `POST` | `/api/admin/login` | 使用 PIN 取得 12 小時權杖 |
| `GET` | `/api/admin/session` | 驗證目前權杖 |
| `POST` | `/api/tournaments` | 建立賽事 |
| `PUT` | `/api/tournaments/:id` | 以 revision 更新單一賽事 |
| `DELETE` | `/api/tournaments/:id?revision=N` | 刪除單一賽事 |
| `PUT` | `/api/tournaments` | 備份還原時取代全部資料 |

後端需要下列環境資源：

- `DB`：Cloudflare D1 binding。
- `ADMIN_PIN`：主辦方共用 PIN。
- `TOKEN_SECRET`：HMAC 簽章密鑰，請使用足夠長的隨機字串。
- `ASSETS`：靜態前端資源 binding。

## 7. 多裁判同步

每場賽事有獨立 `revision`。更新時，前端同時送出 `expectedRevision`：

```sql
UPDATE tournaments
SET data = ?, revision = ?
WHERE id = ? AND revision = ?
```

若資料已被其他裁判修改，更新筆數會是 0，API 回傳 `409 Conflict` 與最新賽事。前端會保留最新版，並只對適合安全合併的操作重試一次。同一場比賽已被完成時不會強制覆蓋。

非記分與非編輯畫面每 3 秒檢查版本；正式記分畫面暫停輪詢，避免尚未送出的比分被清除。

## 8. 本地預覽

ES Modules 不能可靠地透過 `file://` 載入，請使用任一靜態 HTTP server，例如 VS Code Live Server。

只預覽前端時，`/api/*` 不會存在；完整功能需要部署 Worker/D1，或自行提供符合上一節契約的 API。

## 9. 建置與部署

### ChatGPT Sites

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\build.ps1
```

輸出位於 `dist/`：

- `dist/client`：前端靜態檔案。
- `dist/server/index.js`：Worker。
- `dist/.openai/hosting.json`：Sites 設定。
- `dist/.openai/drizzle`：D1 migration。

### 其他平台或自己的機器

前端可以放在任何靜態網站服務。後端原始碼使用 Cloudflare Worker API 與 D1 SQL 介面；若部署到 Node.js、Deno 或自己的伺服器，需要建立相同 API 路徑，並將 D1 存取替換成所選資料庫。只要 API 回傳格式與 revision 行為保持一致，前端不需修改。

部署後可執行：

```bash
node scripts/verify-deployment.mjs https://your-domain.example
```

## 10. 測試

Node 測試：

```bash
node tests/swiss.test.mjs
node tests/api.test.mjs
node tests/data-management.test.mjs
node tests/navigation.test.mjs
node tests/sync.test.mjs
node tests/format-matrix.test.mjs
```

瀏覽器測試：

- `tests/tournament.test.html`：賽制與畫面輸出。
- `tests/full-flow.test.html`：登入到登出的完整 UI 操作。

GitHub Actions 會自動啟動臨時 Ubuntu runner，執行 Node、Chrome、建置與部署檔案檢查。`format-matrix` 會實際跑完 2～32 人的單淘汰及瑞士制，共 62 種組合。

## 11. 修改原則

- 賽制規則放在 `domain` 或 `formats`，不要直接寫進 view。
- view 應盡量保持為「輸入資料、輸出 HTML」。
- 所有雲端修改都透過 store，不要從 UI 直接 `fetch`。
- 新增資料欄位時同步更新 normalize、備份與測試。
- 修改配對、排名、退賽或重賽規則時，至少補一個回歸測試。
- 註解說明「為什麼」與規則限制，避免逐行重述程式語法。

## 12. 目前限制

- 主辦方仍使用共用 PIN，沒有個別裁判帳號與操作紀錄。
- 更新採 3 秒輪詢，不是 WebSocket 即時推播。
- 尚未支援報到、暫停賽事、指定配對、雙淘汰或循環賽。
- 自動測試可降低回歸風險，但不能模擬所有瀏覽器、網路中斷與雲端故障。

## 13. 授權提醒

公開 GitHub repository 不等於自動允許他人修改或再散布。若專案確定要讓任何人自由下載、修改與部署，請另外加入明確的 `LICENSE`（例如 MIT）；授權種類應由 repository 擁有者決定。

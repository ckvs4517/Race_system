# Spin League 開發文件

這份文件提供給需要閱讀、修改、測試或重新部署 Spin League 的開發者。一般使用者的功能與操作流程請先閱讀 [README.md](README.md)。

## 1. 專案定位

Spin League 是一套「靜態前端＋Cloudflare Worker API＋Cloudflare D1」的戰鬥陀螺賽事管理系統。

核心設計目標：

- 公開使用者不登入即可查看賽事與排行榜。
- 主辦方使用共用 PIN 進入管理模式。
- 正式賽事資料由後端保存與驗證，不信任前端送來的賽果。
- 單淘汰與瑞士制規則集中在 `domain`／`formats`，不直接寫進畫面。
- 多台裁判裝置透過 revision 樂觀鎖與 ETag 輪詢降低互相覆蓋的風險。
- 前端保持原生 ES Modules，不依賴前端框架與 bundler。

## 2. 執行架構

```text
瀏覽器
  ├─ index.html
  ├─ 原生 JavaScript ES Modules
  ├─ HTML 字串式 View 與事件綁定
  ├─ 公開賽程、報名表、獨立記分板
  └─ 主辦方後台
          │
          │ HTTPS / JSON
          ▼
Cloudflare Worker
  ├─ 靜態資源轉交 ASSETS binding
  ├─ PIN 驗證與 12 小時 HMAC token
  ├─ 賽事 CRUD
  ├─ 正式賽事 command API
  ├─ 私密參賽資料填寫、名單與飲品管理
  ├─ revision 衝突檢查
  └─ ETag / 304 條件式讀取
          │
          ▼
Cloudflare D1
  ├─ tournaments：每場賽事一筆 JSON＋revision
  └─ registrations：僅保留舊版待審核資料；新流程不再寫入
```

前端與 Worker 共用 `src/domain` 和 `src/formats` 內的賽事規則。Sites 建置時，這些模組會另外複製到 `dist/server`，讓 Worker 在後端執行同一套規則。

## 3. 技術棧

| 區域 | 技術 |
| --- | --- |
| 前端 | HTML、CSS、JavaScript ES Modules |
| 前端路由 | URL hash router |
| 後端 | Cloudflare Worker |
| 資料庫 | Cloudflare D1（SQLite 相容介面） |
| 驗證 | 共用 PIN＋HMAC-SHA256 Bearer token |
| 同步 | revision 樂觀鎖＋ETag 輪詢 |
| 圖片匯出 | Browser Canvas API |
| 建置 | Node.js 腳本＋PowerShell 入口 |
| CI | GitHub Actions、Node.js 22、Headless Chrome |
| 正式部署 | ChatGPT Sites artifact |

專案沒有 `package.json`，目前測試與建置只使用 Node.js 內建 API，因此不需執行 `npm install`。

## 4. 目錄結構

```text
.
├─ index.html                       # 前端 HTML 入口
├─ src/
│  ├─ main.js                      # 應用程式協調、事件綁定、輪詢
│  ├─ core/
│  │  ├─ router.js                 # hash 路由
│  │  └─ roster-filter.js          # 名單搜尋與報到篩選交集
│  ├─ data/
│  │  └─ store.js                  # 唯一前端狀態、API、ETag、revision 衝突處理
│  ├─ domain/
│  │  └─ tournament.js             # 共用賽事生命週期與正式操作規則
│  ├─ formats/
│  │  ├─ registry.js               # 賽制註冊表
│  │  ├─ single-elimination.js     # 單淘汰策略
│  │  └─ swiss.js                  # 四輪瑞士制＋資格加賽＋四強循環
│  ├─ export/
│  │  └─ tournament-image.js       # 完整賽程 PNG 產生器
│  ├─ ui/
│  │  ├─ shell.js                  # 全站導覽、頁尾與同步狀態
│  │  └─ icons.js                  # SVG 圖示
│  ├─ views/
│  │  ├─ home.js                   # 公開首頁
│  │  ├─ guide.js                  # 使用說明
│  │  ├─ scoreboard.js             # 獨立／正式記分板
│  │  ├─ schedule.js               # 賽事清單、賽程、排行榜、報到、排程
│  │  ├─ manage.js                 # 建立與編輯草稿賽事
│  │  ├─ control.js                # PIN 登入與控制中心
│  │  ├─ registration.js           # 私密參賽資料填寫表
│  │  ├─ registration-admin.js     # 填寫連結、正式名單與飲品統計
│  │  └─ data-management.js        # JSON、CSV 備份與還原
│  └─ styles/app.css               # 全站與響應式樣式
├─ worker/index.js                 # Worker API、驗證、D1 存取
├─ db/schema.ts                    # D1 schema 的程式內參考
├─ .openai/
│  ├─ hosting.json                 # Sites project 與 D1 binding
│  └─ drizzle/                     # D1 migration
├─ AGENTS.md                       # AI 維護工具的全域短規則
├─ .agents/skills/                 # Debug、測試、部署、備份的漸進式工作流程
├─ scripts/
│  ├─ agent-context.mjs            # 依任務輸出最小檔案／測試集合
│  ├─ test-fast.mjs                # 常用快速回歸
│  ├─ test-full.mjs                # 全 Node／瀏覽器／建置驗證
│  ├─ preview-local.mjs            # 真實 Worker＋隔離式本機資料庫
│  ├─ validate-backup.mjs          # 備份只讀一致性檢查
│  ├─ project-health.mjs           # Sites 身分與必要檔案檢查
│  ├─ build-site.mjs               # 產生 Sites artifact
│  ├─ verify-deployment.mjs        # 正式網站 smoke test
│  └─ lib/                         # 測試 runner 與本機 D1 模擬器
├─ tests/                          # Node 與瀏覽器測試
├─ build.ps1                       # Windows／CI 建置入口
└─ .github/workflows/
   ├─ ci.yml                       # Push／PR 測試與建置
   └─ production-smoke.yml         # 每日正式站 smoke test
```

## 5. 前端啟動與路由

`index.html` 只建立 `#app` 容器並載入：

```html
<script type="module" src="src/main.js"></script>
```

`src/core/router.js` 使用 URL hash，不需要伺服器 rewrite：

| Hash | 畫面 |
| --- | --- |
| `#home` | 首頁 |
| `#guide` | 使用說明 |
| `#scoreboard` | 獨立記分板 |
| `#schedule` | 賽事清單／單一賽事 |
| `#manage` | 建立或編輯草稿賽事 |
| `#control` | 主辦方登入／控制中心 |
| `#registration` | 報名管理 |
| `#data` | 資料管理 |
| `#register/:tournamentId/:token` | 公開報名表 |

`src/main.js` 的 `render()` 會依目前路由與 store 狀態選擇 View，寫入 `app.innerHTML`，再呼叫對應的 `bind*()` 綁定事件。

```text
網址或狀態改變
  → render()
  → View 產生 HTML 字串
  → app.innerHTML = ...
  → bindGlobalEvents() 與頁面 bind 函式
```

View 不保存正式資料。搜尋文字、篩選條件、對話框、暫時勾選與獨立記分板比分等 UI 狀態，才留在瀏覽器當次執行期間。

## 6. 前端資料流與責任分層

```text
使用者操作
  → view 綁定的事件
  → main.js 協調
  → data/store.js
  → Worker API
  → domain / format 規則
  → D1 revision 寫入
  → Worker 回傳最新 tournament
  → store 取代本機版本
  → subscribe() 通知
  → render()
```

### `views`

- 輸出 HTML。
- 讀取表單與 `data-*` 屬性。
- 綁定純 UI 事件。
- 不直接存取 D1。
- 不應自行決定正式晉級或排名規則。

### `src/main.js`

- 協調路由、View、store 與使用者確認流程。
- 將 UI 操作轉換成後端 action。
- 控制輪詢、Toast、選取賽事與選取比賽。
- 不放入賽制演算法。

### `src/data/store.js`

- 前端唯一正式狀態來源。
- 統一呼叫 `fetch`。
- 將管理 token 放在 `sessionStorage`。
- 保存每個 GET path 的 ETag。
- 處理 revision 衝突與一次安全重試。
- 對外提供 `executeTournamentAction()`、`mutateTournament()` 等 API。

### `src/domain/tournament.js`

- 管理賽事生命週期。
- 驗證名單、比分、戰鬥台數與活動資訊。
- 處理報到、排程、正式記分、重賽、棄賽與退賽。
- 將賽制差異委派給 `formats`。

### `src/formats/*`

- 建立賽制特有的輪次。
- 決定配對、輪空、晉級、統計與排名。
- 不處理 HTTP 或畫面。

## 7. 前端 Store 狀態

`src/data/store.js` 的主要 state：

```js
{
  tournaments: [],
  selectedTournamentId: null,
  selectedMatch: null,
  editingTournamentId: null,
  registrationTournamentId: null,
  registrations: [],
  isAdmin: false,
  loading: true,
  syncStatus: 'idle',
  error: null
}
```

`getState()` 只建立淺層快照，不深拷貝整場賽事，避免數百場對戰時每次 render 都產生大量成本。

## 8. 賽事資料模型

以下為目前常用欄位的簡化範例：

```js
{
  id: 1720000000000,
  name: '夏季公開賽',
  format: 'single_elimination', // 或 swiss
  bracketVersion: 2,
  players: ['A', 'B', 'C', 'D'],
  arenaCount: 2,
  eventInfo: {
    date: '2026-07-25',
    checkInStart: '12:30',
    checkInEnd: '13:00',
    startTime: '13:15',
    venueName: '活動場地',
    address: '活動地址',
    mapUrl: 'https://maps.google.com/...',
    postUrl: 'https://www.instagram.com/...',
    notes: '費用、獎品、禁用清單與其他注意事項'
  },
  status: '準備中', // 準備中、排程中、進行中、已完成
  revision: 1,
  checkInVersion: 1,
  participantStates: {
    A: {
      status: 'active', // active、no_show、withdrawn
      checkedIn: true
    }
  },
  registrationSettings: {
    enabled: true,
    token: '不可預測且至少 16 字元的公開 token',
    capacity: 32,
    deadline: '2026-07-24T15:00:00.000Z',
    fields: []
  },
  totalRounds: null,
  seedPlayerIndexes: [],
  rounds: [
    {
      name: '4 強',
      phase: 'preliminary',
      phaseRound: 1,
      seriesId: 'preliminary',
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
  champion: null,

  // 瑞士制專用
  swissVersion: 2,
  swissStage: 'preliminary',
  qualifierSeriesCount: 0,
  activeQualifierSeriesId: null,
  finalists: []
}
```

### Match 狀態

| 狀態 | 意義 |
| --- | --- |
| `可開始` | 裁判可以進入記分 |
| `已完成` | 已保存比分與勝者 |
| `輪空晉級` | 不需對戰，自動晉級或取得一勝 |
| `等待前輪` | 循環系列上一輪尚未完成 |
| `等待晉級` | 單淘汰未來輪次的純畫面預覽 |

`等待晉級` 節點由 `buildRounds()` 即時計算，不寫入正式 D1 資料。

## 9. 賽事生命週期

```text
建立賽事
  ↓
準備中
  ├─ 編輯名稱、賽制、活動資訊與戰鬥台數
  ├─ 開放公開報名
  ├─ 核准報名或現場新增選手
  ├─ 搜尋／篩選／勾選報到
  └─ 批次移除名單
  ↓ prepare_tournament_schedule
排程中
  ├─ 未勾選者轉為 no_show
  ├─ 公開報名關閉並更換 token
  ├─ randomize_schedule 產生首輪
  ├─ update_opening_pairings 手動調整
  └─ confirm_tournament_schedule 鎖定賽程
  ↓
進行中
  ├─ record_match
  ├─ forfeit_match
  ├─ withdraw_player
  ├─ replay_match
  ├─ 瑞士資格加賽
  └─ 瑞士四強循環
  ↓
已完成
```

### 準備中

- 新賽事可以是空名單。
- `checkInVersion: 1` 的新選手預設 `checkedIn: false`。
- 報到變更、增刪名單都會清除舊排程預覽與種子。
- 完整草稿可以透過 `PUT /api/tournaments/:id` 更新。

### 排程中

`prepareTournamentSchedule()`：

- 驗證已報到人數。
- 單淘汰至少 2 人；瑞士制至少 4 人。
- 未報到者由 `active` 改成 `no_show`。
- 未報到者仍留在 `players`，但不進入賽程。
- 清空 rounds 與 stats。
- 撤銷公開報名 token。

`randomizeTournamentSchedule()` 只使用 `participantStates.status === 'active'` 的選手。

### 進行中

- 勝方分數必須至少 4 分。
- 比分必須為非負整數。
- 平手不能完成比賽。
- 正式操作由 Worker 讀取最新版資料後執行 domain 規則。
- 前端不能以整包 PUT 修改比分、晉級或冠軍。

### 重賽

`resetCompletedMatch()` 會：

- 保留到該輪為止的資料。
- 將指定比賽重設為 `可開始`。
- 刪除該場的比分、勝者與行政判定欄位。
- 捨棄後續輪次。
- 重新計算統計。
- 清除冠軍並將賽事改回 `進行中`。

瑞士制會依被重設輪次的 phase 回到相對應階段。

## 10. 參賽者狀態

| status | 意義 | 是否進入後續配對 |
| --- | --- | --- |
| `active` | 正常參賽 | 是 |
| `no_show` | 未出席 | 否 |
| `withdrawn` | 中途退賽 | 否 |

`checkedIn` 主要用於 `準備中` 報到階段；進入 `排程中` 後，未勾選者會正式轉為 `no_show`。

退賽與未出席目前是不可逆操作。若選手仍有一場 `可開始` 比賽，系統會透過一般記分流程做 4：0 行政判定，確保統計與下一輪只維護一套邏輯。

## 11. 排行榜規則

### 未報到者排序規則

目前程式明確將參賽者分為兩個排名群組：

```text
群組 0：有實際報到／參賽者
群組 1：no_show 或仍為 checkedIn:false 的選手
```

所有群組 0 選手一定排在群組 1 之前。因此：

- `0 勝 4 敗` 的實際參賽者，仍排在 `0 勝 0 敗` 的未報到者前面。
- 未報到者保留在完整名單與排行榜中，但位於所有參賽者之後。
- 瑞士制並列名次的 key 也包含排名群組，避免未報到者與實際參賽者取得相同名次。

相關實作：

- `src/formats/swiss.js`：`participantRankingGroup(tournament, player)`
- `src/formats/single-elimination.js`：`participantRankingGroup(status)`

### 單淘汰排行榜

依序比較：

1. 是否為未報到群組（實際參賽者優先）
2. 是否為冠軍
3. 勝場
4. 總得分
5. 得失分差
6. 選手名稱

### 瑞士預賽排行榜

同一排名群組內依序比較：

1. 勝場多者優先
2. 敗場少者優先
3. 總得分高者優先
4. 原始選手順序

名次 key 為：

```text
排名群組 : 勝場 : 敗場 : 總得分
```

只有四項完全相同才會並列名次。

### 四強循環決賽排行榜

進入四強後：

- 四位 finalist 的勝、敗與總分只由 `phase: 'final'` 輪次重新計算。
- 非 finalist 繼續顯示預賽戰績。
- 最終輸出順序為「四強決賽排名＋其餘預賽排名」。
- 預賽、資格加賽與決賽比賽本身仍全部保留在 `tournament.rounds`。

因此四強開始時，前四名顯示 `0 勝 0 敗 0 分` 是決賽階段的新統計，不代表預賽資料被刪除。

## 12. 賽制策略介面

賽制在 `src/formats/registry.js` 註冊。主要策略方法：

| 方法 | 用途 |
| --- | --- |
| `initialSeedCount(players)` | 建立首輪前需要多少種子 |
| `totalRounds(players)` | 可預先得知的輪數 |
| `initialState()` | 賽制專屬初始欄位 |
| `createOpeningRound(players, seeds)` | 建立首輪 |
| `initializeStats(players)` | 建立統計物件 |
| `activateOpeningRound(round, stats)` | 處理首輪輪空 |
| `recordResult(...)` | 記錄比分並產生後續輪次或冠軍 |
| `getStandings(tournament)` | 完整排行榜 |
| `getPhaseStandings(tournament, phase)` | 特定 phase 排名 |
| `rebuildStats(players, rounds)` | 重賽後重建統計 |

新增賽制時，先建立策略檔並加入 registry。共用的報到、排程、記分、行政判定與 revision API 通常不需重寫。

## 13. 單淘汰規則

`src/formats/single-elimination.js`：

- 奇數首輪需要一位輪空種子。
- 正式建立首輪時，輪空 match 直接標記 `輪空晉級`。
- 一輪全部完成後，勝者形成下一輪。
- 後續剩餘奇數人時，依以下條件選表現種子：
  1. 平均得分高
  2. 得失分差高
  3. 輪空次數少
  4. 隨機值
- 只允許目前最後一輪記分。
- 剩下一位 active 選手時產生冠軍。

`buildRounds()` 會為畫面投影未來 `等待晉級` 輪次，但正式資料只保存實際已產生的 rounds。

## 14. 瑞士制規則

`src/formats/swiss.js`：

### 預賽

- 至少 4 位選手。
- 固定四輪。
- 每輪完成後才建立下一輪。
- 配對優先避免重複交手。
- 同時優先縮小雙方勝場差。
- 無法完全避免重複時才允許重複配對。
- 奇數人時，從目前排序後段選擇尚未輪空者；若全部都輪空過，再選最後一位。
- 瑞士輪空計為一勝，並增加 `byeCount`。

### 四強資格

四輪預賽後進入 `swissStage: 'qualification'`，不會自動建立冠軍。

- 四強資格明確時，主辦方直接選四人開始決賽。
- 若 `rank <= 4` 的同分群組超過四人，畫面顯示資格積分決定賽。
- 資格加賽可選 2～6 人。
- 每次資格加賽有獨立 `seriesId`。
- 完成資格加賽後回到 `qualification`，可再次加賽或確認四強。

### 四強循環

- 必須選 exactly 4 位選手。
- 使用 round-robin circle method 產生三輪六場。
- 每一輪完成後才解鎖下一輪。
- 公開賽程固定顯示一台戰鬥台。
- 最後一輪完成後依決賽戰績產生冠軍。

## 15. 多戰鬥台顯示

一般輪次依 match index 輪流分配：

```js
stationIndex = matchIndex % arenaCount
```

這使各台場數最多只差一場。戰鬥台目前是畫面與執行安排，不是資料模型中的獨立 entity；match 內沒有持久化 `arenaId`。

瑞士四強循環的畫面固定以 `arenaCount: 1` render，但不會改寫 tournament 原本的 `arenaCount`。

目前 CSV 對戰明細也是依 tournament-level `arenaCount` 即時計算戰鬥台，因此四強決賽的一台顯示規則沒有另外持久化到 CSV 欄位。

## 16. 私密參賽資料填寫與飲品

這不是公開招募或付款流程。主辦方在系統外確認資格與付款後，才把私密連結交給參賽者；送出成功便直接加入 `tournament.players`，不需後台核准。

### 資料模型

- `participantDetails[player]`：保存 `phone`、`notes`、`answers` 與已解析的 `drink`。
- `drinkSettings`：每場賽事自己的單一飲品項目清單，格式為 `{ enabled, notice, changeNotice, items[] }`；每個 `items[]` 項目都有 `id`、`name`、`active` 與 `order`，且就是選手可直接選擇的一杯飲品。
- `drink`：新版選擇保存為 `{ category: 'item', itemId, displayName }`。飲品啟用時，公開填寫與主辦方新增／編輯選手都必須選擇一項；介面不提供「暫不選擇」。
- `drink.displayName`：送出當下保存的完整顯示名稱；日後停用品項仍能正確顯示歷史資料。
- 舊版巢狀咖啡口味／作法資料會在 normalize 時展開為單一飲品項目；舊賽事若沒有飲品欄位，normalize 會補空物件並保持飲品功能停用。

### 填寫流程

```text
私密 GET 只取得活動摘要、欄位與有效飲品菜單
  → POST 驗證名稱、電話、自訂欄位與一個必填的飲品 itemId
  → Worker 讀取最新 tournament revision
  → domain 將選手直接加入正式名單，checkedIn 預設 false
  → D1 以 WHERE revision = ? 樂觀鎖更新 tournament JSON
  → 衝突時最多重讀並重試兩次
```

名稱與正規化電話都不可在同場賽事重複。公開回應只包含剛送出的名稱與飲品，不回傳電話、完整名單或 `participantDetails`。

主辦方可在報到畫面新增選手，或在開賽前編輯名稱、電話與飲品。飲品統計依保存的 `displayName` 分組，可直接複製。

### 公開連結安全

- 報名 token 由 `crypto.randomUUID()` 產生並移除 `-`。
- 手動關閉報名，或進入排程時，會更換 token。
- 舊網址會回傳找不到活動。
- 可選填 deadline；即使沒有 deadline，只要賽事離開 `準備中` 就停止收件。
- 同一賽事以正式名單名稱與正規化電話避免重複填寫。
- 表單包含 `website` honeypot；機器人填寫時 API 直接回傳成功但不寫入。
- 公開 GET 不回傳既有報名者電話或名單。

`registrationSettings.fields` 仍支援 `text`、`textarea`、`checkbox` 擴充欄位。舊版 `registrations` table 與 API 暫時保留以讀取歷史資料，但新版 POST 不再新增 pending row，也不需要 D1 migration。

## 17. D1 Schema

正式 migration 位於 `.openai/drizzle/`，`db/schema.ts` 只作為程式內參考。

### tournaments

```sql
CREATE TABLE IF NOT EXISTS tournaments (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)
```

- `data` 保存不含 revision 的 tournament JSON。
- `revision` 單獨保存，供樂觀鎖與 ETag 使用。
- 一場賽事一列。

### registrations

```sql
CREATE TABLE IF NOT EXISTS registrations (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  answers TEXT NOT NULL DEFAULT '{}',
  dedupe_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (tournament_id, dedupe_key)
)
```

目前 schema 沒有 foreign key；刪除 tournament 不會由資料庫自動級聯刪除 registrations。

## 18. API

### 公開端點

| Method | Path | 用途 |
| --- | --- | --- |
| `GET` | `/api/tournaments` | 取得全部賽事，支援 ETag |
| `GET` | `/api/tournaments/:id` | 取得單一賽事，支援 ETag |
| `GET` | `/api/public/registrations/:tournamentId/:token` | 取得公開報名表資訊 |
| `POST` | `/api/public/registrations/:tournamentId/:token` | 送出公開報名 |

### 管理端點

管理端點使用：

```http
Authorization: Bearer <token>
```

| Method | Path | 用途 |
| --- | --- | --- |
| `POST` | `/api/admin/login` | PIN 登入並取得 12 小時 token |
| `GET` | `/api/admin/session` | 驗證 token |
| `POST` | `/api/tournaments` | 建立賽事 |
| `PUT` | `/api/tournaments/:id` | 更新準備中草稿整包資料 |
| `DELETE` | `/api/tournaments/:id?revision=N` | 依 revision 刪除賽事 |
| `POST` | `/api/tournaments/:id/actions` | 執行正式賽事 command |
| `PUT` | `/api/tournaments` | JSON 還原時取代 tournaments table |
| `GET` | `/api/tournaments/:id/registrations` | 取得報名名單 |
| `PUT` | `/api/registrations/:id` | 核准、候補或拒絕報名 |

### Command API

`POST /api/tournaments/:id/actions` body：

```js
{
  type: 'record_match',
  payload: {
    roundIndex: 0,
    matchIndex: 1,
    scoreA: 4,
    scoreB: 2
  },
  expectedRevision: 7
}
```

支援 action：

| type | 用途 |
| --- | --- |
| `set_check_in` | 設定報到 |
| `add_player` | 現場新增選手 |
| `remove_player` | 移除單一草稿選手 |
| `remove_players` | 批次移除草稿選手 |
| `draw_seeds` | 抽選單淘汰種子 |
| `randomize_bracket` | 準備中重新排列名單 |
| `start_tournament` | 兼容的一步式快速開賽 |
| `prepare_tournament_schedule` | 鎖定報到名單、進入排程 |
| `randomize_schedule` | 產生首輪 |
| `update_opening_pairings` | 手動調整首輪配對 |
| `confirm_tournament_schedule` | 鎖定配對並正式開賽 |
| `record_match` | 保存比分 |
| `forfeit_match` | 單場棄賽 4：0 |
| `replay_match` | 重設已完成比賽 |
| `withdraw_player` | 未出席或中途退賽 |
| `start_swiss_qualifier` | 建立瑞士資格加賽 |
| `start_swiss_final` | 建立四強循環決賽 |
| `update_registration_settings` | 開關報名、名額與截止時間 |

Worker 只接受 `type + payload + expectedRevision`，不接受前端直接送入已算好的正式 rounds 或 champion。

## 19. 驗證與安全

### PIN 與 Token

- `ADMIN_PIN` 只存在 Worker secret。
- `TOKEN_SECRET` 用於 HMAC-SHA256 簽章。
- 登入 token claims：`{ role: 'admin', exp }`。
- token 有效期 12 小時。
- 前端只存在 `sessionStorage`，關閉分頁後清除。
- Worker 以 SHA-256 固定長度 digest 後逐 byte 比較 PIN 與簽章，降低簡單時間差洩漏。

### 必要 Worker bindings／secrets

- `DB`：D1 binding
- `ASSETS`：靜態資源 binding
- `ADMIN_PIN`：主辦方 PIN
- `TOKEN_SECRET`：足夠長的隨機 HMAC secret

不要將 `ADMIN_PIN` 或 `TOKEN_SECRET` 寫入前端、Git repository 或 `.openai/hosting.json`。

### 目前未實作

- PIN 登入 rate limit
- 個別裁判帳號
- 每台戰鬥台權限
- 操作 audit log
- 兩步驟驗證

## 20. Revision 樂觀鎖

每場 tournament 有獨立 revision。正式 action 更新概念：

```sql
UPDATE tournaments
SET data = ?, revision = ?, updated_at = CURRENT_TIMESTAMP
WHERE id = ? AND revision = ?
```

若更新筆數為 0：

1. 代表資料已被其他裝置修改。
2. Worker 回傳 `409 Conflict` 與最新 tournament。
3. store 先套用最新版。
4. command action 預設安全重試一次。
5. 再次失敗時顯示衝突訊息，由使用者確認後重做。

準備中草稿的整包 `PUT` 也使用 revision，但目前一般表單儲存不預設自動重試，避免默默合併使用者的草稿編輯。

刪除也必須附帶 revision，避免刪除已被別人更新的賽事。

## 21. ETag 與輪詢

### ETag

- 單一賽事：`"t-<id>-<revision>"`
- 賽事清單：由所有 `id:revision` 產生 FNV-like signature
- 前端保存每個 GET path 的 ETag。
- 下一次 GET 附上 `If-None-Match`。
- 未變更時 Worker 回傳 `304`，前端不解析 JSON、不 notify、不 render。

### 輪詢頻率

| 狀態 | 頻率 |
| --- | --- |
| 賽程頁且已選擇賽事 | 約 4 秒，只讀取該場賽事 |
| 首頁 | 約 15 秒，讀取賽事清單 |
| 分頁隱藏 | 約 30 秒 |
| 正式記分板正在輸入 | 暫停賽程輪詢 |

分頁重新變成 visible 時會立即檢查更新。

`refreshInFlight` 防止上一個要求尚未完成時建立第二個相同輪詢。

## 22. 備份、CSV 與圖片

### JSON

格式：

```js
{
  format: 'spin-league-backup',
  version: 1,
  exportedAt: '...',
  tournaments: []
}
```

- 最多匯入 200 場賽事。
- 驗證賽事 ID、名稱、名單、人數與狀態。
- 還原 API 會刪除並重建 `tournaments` table 內容。
- JSON 不包含 `registrations` table。
- tournament JSON 會包含 `participantDetails`，因此備份可能含電話等個資。
- 現行還原程式不會刪除 registrations rows；不同 ID 的舊報名資料可能成為孤立資料，部署維護時需留意。

### CSV

- 賽事總覽：一列一場賽事。
- 參賽者與飲品：一列一位正式參賽者，包含電話、飲品、報到與狀態。
- 對戰明細：一列一場 match，包含兩邊飲品。
- 使用 UTF-8 BOM，方便 Excel 開啟中文。
- 對 CSV 儲存格做雙引號 escaping。

### PNG

`src/export/tournament-image.js`：

- 使用 Canvas，不依賴 DOM 截圖套件。
- 固定 1600px 寬。
- 直接讀取 `tournament.rounds`。
- 即使公開賽程只顯示目前輪次，PNG 仍包含全部預賽、資格加賽與決賽。
- 只在使用者按下載按鈕時產生。

## 23. 本地預覽

ES Modules 不應直接以 `file://` 開啟。專案提供兩種本機伺服器。

### 隔離式完整預覽

```bash
node scripts/preview-local.mjs
```

開啟 `http://127.0.0.1:8765/`。此伺服器：

- 直接執行目前的 `worker/index.js`；
- 使用 `scripts/lib/local-d1.mjs` 模擬 Worker 所需的 D1 API；
- 將本機資料保存到 `.dev-data/local-d1.json`；
- 預設綁定 `0.0.0.0`，同一 Wi-Fi 的手機可用畫面列出的 LAN URL 測試；
- 不會代理、讀取或修改正式網站與正式 D1。

本機管理 PIN 預設為 `2468`。可設定：

```bash
LOCAL_ADMIN_PIN=1357 node scripts/preview-local.mjs
```

Windows PowerShell：

```powershell
$env:LOCAL_ADMIN_PIN = '1357'
node scripts/preview-local.mjs
```

以備份建立隔離資料庫：

```bash
node scripts/preview-local.mjs --reset --backup path/to/spin-league-backup.json
```

`--backup` 只匯入到 `.dev-data/`，不會呼叫正式 restore API。`--reset` 也只刪除本機測試資料。

### 純靜態測試伺服器

```bash
node tests/local-test-server.mjs
```

此伺服器僅供 Headless Chrome 測試頁面與靜態資源載入，不提供 API。

## 24. ChatGPT Sites 建置

執行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\build.ps1
```

`build.ps1` 尋找 Node.js 後執行 `scripts/build-site.mjs`。

輸出：

```text
dist/
├─ client/
│  ├─ index.html
│  └─ src/
├─ server/
│  ├─ index.js
│  ├─ domain/
│  └─ formats/
└─ .openai/
   ├─ hosting.json
   └─ drizzle/
```

建置腳本會：

1. 清除舊 `dist`。
2. 複製前端 `index.html` 與 `src`。
3. 將 Worker 複製到 `dist/server/index.js`。
4. 將 Worker 的 shared module import 從 `../src/domain/tournament.js` 改成 `./domain/tournament.js`。
5. 複製 `domain`、`formats`、hosting config 與全部 migration。
6. 檢查必要檔案大小，避免產生空或不完整 artifact。

`.openai/hosting.json` 綁定現有 Sites project 與 D1 binding。更新既有網站時，不要任意刪除或更換 `project_id`。

## 25. 其他部署平台

前端可放在任何靜態網站服務，但目前後端直接依賴：

- Cloudflare Worker Request／Response API
- `env.ASSETS.fetch()`
- D1 `prepare().bind().first()/all()/run()`
- `env.DB.batch()`
- Web Crypto API

要搬到 Node.js、Deno 或自架伺服器，需要實作相同 API contract，並將 D1 存取替換為所選資料庫。只要路徑、JSON 格式、revision 與錯誤行為一致，前端可維持不變。

部署後 smoke test：

```bash
node scripts/verify-deployment.mjs https://your-domain.example
```

檢查內容：

- 首頁可讀取
- 正式記分板仍有 4 分勝負驗證
- 棄賽入口存在
- 公開賽事 API 回傳 tournaments array

## 26. 測試

### 統一測試入口

常用快速回歸：

```bash
node scripts/test-fast.mjs
```

完整檢查會自動發現全部 `*.test.mjs`，最後建立 Sites artifact。為避免不同桌面環境的 Chrome 啟動差異，瀏覽器流程預設略過：

```bash
node scripts/test-full.mjs
```

選項：

```bash
node scripts/test-full.mjs --browser=required
node scripts/test-full.mjs --skip-build
```

成功測試只輸出一行摘要；失敗時才顯示該指令的完整 stdout／stderr，避免 CI 與 AI 上下文充滿成功 log。

個別 Node 測試仍可直接執行：

```bash
node tests/swiss.test.mjs
node tests/api.test.mjs
node tests/registration.test.mjs
node tests/check-in.test.mjs
node tests/data-management.test.mjs
node tests/navigation.test.mjs
node tests/sync.test.mjs
node tests/action-sync.test.mjs
node tests/event-info.test.mjs
node tests/responsive-ui.test.mjs
node tests/guide.test.mjs
node tests/roster-filter.test.mjs
node tests/format-matrix.test.mjs
```

### 瀏覽器測試

- `tests/tournament.test.html`：賽制、報到、行政判定、重賽與畫面輸出。
- `tests/full-flow.test.html`：從登入到登出的完整 UI 流程，使用 mock API。

CI 在 Ubuntu runner 使用 Headless Chrome 開啟兩份 HTML，並搜尋 `PASS`。

### Format matrix

`tests/format-matrix.test.mjs` 會完整跑完：

- 2～32 人單淘汰
- 4～32 人新版瑞士制
- 合計 60 場模擬賽事
- 驗證人數、輪數、可完成性、冠軍、排行榜與剩餘節點

### GitHub Actions

`ci.yml` 在 Push 到 `main`、Pull Request 與手動執行時：

1. 執行 `scripts/project-health.mjs` 檢查 AI 規則、Sites 身分與 Worker 建置 import。
2. 執行 `scripts/test-full.mjs`，涵蓋全部 Node tests、format matrix 與 Sites build。
3. 使用 CI 既有的 Headless Chrome 指令執行兩份瀏覽器流程。
4. 驗證 artifact 結構。
5. 上傳可部署 tar，保留 14 天。

`production-smoke.yml` 每日與手動檢查正式網站。

## 27. 修改功能時的建議流程

```text
先找 View 的入口文字或 data-* 屬性
  → 找 main.js 對應事件
  → 找 store API
  → 找 Worker route / action type
  → 找 domain 函式
  → 找 format 規則
  → 補測試
  → 執行 build
```

例如排行榜問題：

```text
src/views/schedule.js
  → getTournamentStandings()
  → src/domain/tournament.js
  → getTournamentFormat(...).getStandings()
  → src/formats/swiss.js 或 single-elimination.js
```

## 28. 開發原則

- 賽制規則放在 `domain` 或 `formats`。
- View 只處理顯示與輸入，不直接決定正式結果。
- UI 不直接 `fetch`，一律經過 store。
- 進行中與已完成賽事不得用整包 PUT 修改。
- 新增正式操作時，新增 action type 並由 Worker 呼叫 domain。
- 新增資料欄位時同步更新 normalize、Worker validation、備份、匯出與測試。
- 修改配對、排名、未出席、退賽、重賽或晉級時，必須補回歸測試。
- 中文註解可以使用 UTF-8；註解應說明「為什麼」與業務限制，而不是逐行翻譯程式碼。
- 對所有輸出到 HTML 的使用者資料做 escaping。
- 正式 secret 不得進入 repository。

## 29. 已知限制與技術債

- 所有主辦方／裁判共用同一組 PIN。
- 沒有個別身分、操作紀錄與撤銷某位裁判權限的功能。
- 同步是 4 秒／15 秒輪詢，不是 WebSocket push。
- 登入尚未加入 rate limit。
- 戰鬥台只是 render 分區，沒有獨立持久化 entity 或裁判權限。
- 四強決賽的一台戰鬥台規則沒有獨立保存到 match，CSV 仍依 tournament-level arenaCount 推算。
- 公開報名自訂欄位底層已存在，但沒有 UI 編輯器。
- JSON 備份不包含 registrations，還原也不管理 registrations table。
- 刪除賽事不會自動級聯刪除 registrations。
- 尚未支援暫停賽事、指定後續配對、雙淘汰或完整官方規則自動判定。
- 自動測試不能涵蓋所有瀏覽器差異、斷線、D1 故障與惡意流量。

## 30. AI 輔助維護結構

Repository 將人類文件、AI 短規則、任務工作流程與可執行腳本分開：

| 位置 | 用途 |
| --- | --- |
| `README.md` | 一般使用者功能與操作 |
| `DEVELOPMENT.md` | 完整架構與技術設計 |
| `AGENTS.md` | 每次 AI 任務都應遵守的短規則與安全邊界 |
| `src/formats/AGENTS.md` | 賽制目錄的局部規則 |
| `worker/AGENTS.md` | API、權限、revision、個資局部規則 |
| `.agents/skills/` | Debug、測試、部署、備份等特定任務才需要的詳細流程 |
| `scripts/agent-context.mjs` | 依任務關鍵字輸出最小相關檔案、測試與 invariant |
| `scripts/*` | 將重複推理轉為固定、可驗證的命令 |

範例：

```bash
node scripts/agent-context.mjs "四強 排行榜 未報到"
node scripts/project-health.mjs
node scripts/test-fast.mjs
```

這些文件不應複製完整程式碼或整份 DEVELOPMENT。業務 invariant 只保存一份於 `.agents/skills/spin-league-debug/references/invariants.md`，新增重要規則時應同步更新相關測試。

## 31. 授權

Repository 目前沒有明確 `LICENSE`。公開可讀不等於允許修改、再散布或商業使用。若要開放第三方使用，請由擁有者選擇並加入適合的授權，例如 MIT、Apache-2.0 或其他條款。

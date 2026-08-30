# Spin League V2 開發文件

這份文件描述目前已完成的 V2 codebase。一般功能與主辦方操作請先看 [README.md](README.md)；架構硬性規則請看 [ARCHITECTURE.md](ARCHITECTURE.md) 與 [AGENTS.md](AGENTS.md)。

## 1. 系統定位

Spin League 是瀏覽器原生的戰鬥陀螺賽事管理系統：

```text
Browser ES Modules
  ↓ HTTPS / JSON
Cloudflare Worker / ChatGPT Sites
  ↓
Cloudflare D1
```

主要原則：

- 公開使用者不登入即可看活動、賽程、比分與排行榜。
- 主辦方以共用 PIN 登入管理模式。
- 正式賽果由 Worker 重新驗證／執行 domain 規則，不能相信前端自行算好的 rounds/champion。
- D1 一場 tournament 一列 JSON，另有 revision 做樂觀鎖。
- 前端使用 ETag 輪詢降低未變更資料量。
- 沒有 React/Vue；維持 HTML、CSS、JavaScript ES Modules。
- V2 架構重構 Phase 0–5 已完成。

## 2. Production / Staging 身分

Production Site：`spin-league-tournament`。

永久 Staging Site：`spin-league-test`，使用獨立 Test D1。

重要：

- `.openai/hosting.json` 是 production Sites project / D1 binding 身分，不可因測試站而覆寫。
- Staging E2E 只能寫 Test D1。
- 正式部署前必須確認 staging 已部署到指定 Git SHA，並用同一 SHA 執行 `Staging E2E`。
- 正式部署需要明確批准；CI 綠燈不代表可以自行發布。
- 正式 D1 不做 reset/restore/replace，除非有獨立確認與備份。

## 3. 目前 V2 目錄責任

```text
src/
├─ main.js                         # 薄協調層：route/render/global coordination
├─ core/                           # router、build info 等核心 runtime
├─ data/
│  └─ store.js                     # API/state/auth/ETag/revision
├─ features/                       # 使用者互動/controller
│  ├─ control/
│  ├─ data-management/
│  ├─ registration/
│  ├─ schedule/
│  └─ tournament-management/
├─ domain/
│  ├─ tournament.js               # 穩定 facade
│  ├─ tournament/                 # 賽事生命週期/名單/記分/排名等模組
│  └─ ranking/                    # 排名規則
├─ formats/                        # single elimination / Swiss / RR / win streak
├─ views/
│  ├─ schedule.js                 # 薄 facade
│  └─ schedule/                    # 賽程/排行榜/名單/決策面板 render
├─ ui/                             # 共用 UI primitive
├─ export/                         # PNG/PDF/匯出
└─ styles/
   ├─ app.css                      # ordered import manifest
   ├─ base/
   ├─ features/
   └─ responsive/

worker/
├─ index.js                        # 薄 entry
├─ tournament-domain.js            # shared domain packaging bridge
├─ routes/                          # API route/response/ETag
├─ services/                        # auth/validation/action dispatch
└─ db/                              # D1 statements
```

### `src/main.js`

只負責全域組裝。功能 DOM interaction 應在 `src/features/`，不要再把大量事件 handler 塞回 main。

### `src/features/`

負責功能互動，例如：

- schedule controller
- check-in save queue
- quick score
- Stage 2 控制
- registration workflow
- tournament-management/data-management/control controller

### `src/data/store.js`

前端官方資料邊界：

- 所有正式 API 呼叫
- admin token (`sessionStorage`)
- ETag cache
- revision conflict / safe retry
- polling
- public/admin tournament representation 切換

### `src/domain/tournament.js`

這是穩定 facade：

```js
export * from './tournament/index.js';
```

外部模組不要 deep import `src/domain/tournament/*`。

內部責任：

| 模組 | 主要責任 |
| --- | --- |
| `lifecycle.js` | 建立、編輯、排程、開始、提早結束 |
| `normalization.js` | 舊資料向後相容 normalization |
| `roster.js` / `participant-model.js` | 名單、報到、選手狀態 |
| `registration.js` / `registration-settings.js` | 私密參賽資料設定與加入名單 |
| `matches.js` / `score-validation.js` | 正式比分、棄賽、重賽、退賽 |
| `standings.js` | 排行榜 query |
| `swiss-actions.js` | Swiss qualification / Stage 2 動作 |
| `visibility.js` | public-safe tournament projection |
| 其他小模組 | pairings、metadata、factory、legacy compatibility、constants |

### `worker/`

Worker 已完成 Phase 4 分層：

- `routes/`：path/method、HTTP response、ETag
- `services/`：admin auth、payload validation、server-authoritative action
- `db/`：唯一可直接呼叫 D1 `.prepare()` / `.batch()` 的層
- `index.js`：只做 entry/delegation

## 4. 樣式架構與部署

Source CSS 是 Phase 5 模組化結構。`src/styles/app.css` 只保存有順序的 `@import` manifest；import 順序是 cascade compatibility contract。

開發 source：多檔。

Sites artifact：`scripts/build-site.mjs` 依 manifest 順序把模組合成單一：

```text
dist/client/src/styles/app.css
```

因此維護時有清楚 ownership，但活動現場瀏覽器不需要為十多個 source CSS 額外做 network round-trip。

`tests/v2-css-boundary.test.mjs` 鎖 source manifest；build script 會拒絕 deploy artifact 仍含 `@import`。

## 5. 賽事資料模型

簡化 tournament：

```js
{
  id,
  name,
  format,
  status,              // 準備中 / 排程中 / 進行中 / 已完成
  revision,
  players: [],
  arenaCount,
  eventInfo: {},
  participantStates: {
    player: { status: 'active', checkedIn: false }
  },
  participantDetails: {
    player: {
      phone,
      notes,
      answers,
      drink
    }
  },
  registrationSettings: {
    enabled,
    token,
    capacity,
    deadline,
    fields: []
  },
  rounds: [],
  playerStats: {},
  champion,
  // format-specific fields...
}
```

### 私密欄位

以下只屬於管理端：

- `participantDetails`
- `registrationSettings.token`

公開 tournament API 一律先經過 `toPublicTournament()`，不能將上述欄位送給未登入 client。

注意：players 名稱、公開賽程、比分、排行榜、活動資訊本來就是公開資料。

## 6. Public / Admin API 資料邊界

### 公開讀取

| Method | Path | 行為 |
| --- | --- | --- |
| GET | `/api/tournaments` | public-safe tournament list |
| GET | `/api/tournaments/:id` | public-safe single tournament |
| GET | `/api/public/registrations/:id/:token` | 私密連結表單摘要 |
| POST | `/api/public/registrations/:id/:token` | 送出參賽資料 |

未登入的 tournament list/single 不可包含：

```text
participantDetails
registrationSettings.token
```

### Admin

登入成功取得 12 小時 HMAC Bearer token：

```http
Authorization: Bearer <token>
```

同一個 GET tournament endpoint 在有效 admin token 下回傳完整 tournament，供主辦方看到電話、飲品與私密報名連結。

Public/admin ETag 使用不同 namespace，避免：

```text
先 public GET 得到 ETag
→ 登入
→ admin GET 不小心 304
→ client 仍只有 public-safe data
```

`src/data/store.js` 登入後會重新抓一次完整 tournament list；登出時會立即從 browser memory 移除私密欄位。

## 7. Admin API / Command API

主要管理端點：

| Method | Path | 用途 |
| --- | --- | --- |
| POST | `/api/admin/login` | PIN 登入 |
| GET | `/api/admin/session` | session 驗證 |
| POST | `/api/tournaments` | 建立賽事 |
| PUT | `/api/tournaments/:id` | 只允許準備中草稿整包更新 |
| DELETE | `/api/tournaments/:id?revision=N` | revision-safe 刪除 |
| POST | `/api/tournaments/:id/actions` | 正式 command |
| PUT | `/api/tournaments` | JSON restore：整批取代 tournaments |
| GET | `/api/tournaments/:id/registrations` | 舊 registrations table 管理資料 |
| PUT | `/api/registrations/:id` | 舊版報名狀態管理 |

目前 action type 以 `worker/services/tournament-actions.js` 為準，包括：

```text
set_check_in
set_all_check_in
add_player
update_participant
remove_player
remove_players
draw_seeds
randomize_bracket
start_tournament
prepare_tournament_schedule
randomize_schedule
update_opening_pairings
confirm_tournament_schedule
record_match
forfeit_match
replay_match
withdraw_player
start_swiss_qualifier
start_swiss_final
complete_swiss_by_standings
complete_tournament_early
start_round_robin_tiebreak
update_registration_settings
```

正式操作 body：

```js
{
  type: 'record_match',
  payload: { roundIndex: 0, matchIndex: 0, scoreA: 4, scoreB: 2 },
  expectedRevision: 7
}
```

不要讓 client 直接 POST 算好的 rounds/champion。

## 8. Revision / 多裝置衝突

D1 tournament row：

```sql
id TEXT PRIMARY KEY,
data TEXT NOT NULL,
revision INTEGER NOT NULL,
updated_at TEXT
```

正式更新使用 CAS：

```sql
UPDATE tournaments
SET data = ?, revision = ?, updated_at = CURRENT_TIMESTAMP
WHERE id = ? AND revision = ?
```

若 changes = 0：

1. 代表另一台裝置先更新。
2. Worker 回 409 + 最新 tournament。
3. store 套用最新版。
4. 可安全重做的 command 最多自動 retry 一次。
5. 無法安全合併時要求使用者重新確認。

`tests/action-sync.test.mjs` 與 API tests 驗證 stale revision 不可覆蓋新資料。

## 9. ETag / Polling

GET tournament 支援 ETag；資料未變可回 304。

概念頻率仍是：

- 選取中的賽事頁：約 4 秒 single-tournament refresh
- 首頁/列表：約 15 秒
- 背景頁面：降頻
- 正式記分輸入期間避免不必要 rerender

ETag 只節省讀取，不負責 write conflict；write correctness 仍由 revision 決定。

## 10. 賽制

目前支援四類：

### Single Elimination

- 2–48 位已報到選手
- 輸一場淘汰
- 奇數輪可輪空
- 完成一輪才產生真正的下一輪資料

### Swiss

- 4–48 位
- Stage 1 固定四輪
- 建立賽事時選 Top 4 / Top 8 晉級人數
- 可使用傳統 ranking 或對手強度（Buchholz）ranking；賽事開始後規則鎖定
- qualification line 同分時可建立資格決定賽
- Stage 2 在 Stage 1 完成後再選模式
- Top 4 可進循環或單淘汰
- Top 8 可進循環、單淘汰或 Stage 2 Swiss
- Stage 2 Swiss 的輪數由主辦方在開始前設定
- 歷史 Stage 1 / qualifier rounds 保留，不因 Stage 2 改寫

### Round Robin

- 小型賽事 3–8 人
- 每人互打
- 依勝場/得分等規則排名
- 第一名並列時可建立相同名次選手的 tie-break series

### Win Streak

- 小型賽事 3–8 人
- 勝者守擂、敗者排隊尾
- 依目前規則先達目標連勝者奪冠

完整規則以 `src/formats/`、ranking domain 與回歸測試為準。

## 11. Match / lifecycle invariants

- 勝方最終分數至少 4。
- 非負整數比分。
- 平手不可 confirm。
- `可開始` 才能正式記分。
- 未報到者不進賽程，且排行榜一定在有實際參賽者後面。
- 有報到但全敗者仍高於 no_show。
- replay earlier match 可能失效後續 rounds/champion。
- public 頁面不能執行正式寫入。
- standalone scoreboard 不可改 tournament。
- started/completed tournament 不可用整包 PUT 竄改正式結果。

## 12. Registration / 個資

新版參賽資料流程不是公開招募系統：主辦方在外部確認資格後，把 tokenized link 給參賽者。

送出：

```text
GET token link summary
→ participant submits name/phone/notes/custom answers/drink
→ Worker validates latest tournament
→ domain adds confirmed participant
→ CAS writes updated tournament JSON
```

電話/notes/answers 保存在 `participantDetails`，只可透過 admin tournament representation 取得。

報名 token：

- 由安全 random UUID 衍生
- 關閉報名／進排程後更換
- 舊 URL 失效
- public tournament API 不回傳 token

目前沒有 Turnstile/rate limit；token 保密與 honeypot 是現有基本防護。

## 13. D1 / migrations

正式 migrations：`.openai/drizzle/*.sql`。

`db/schema.ts` 是 code-side 參考，不是部署時自行重建 production DB 的指令。

`tournaments`：正式資料主表。

`registrations`：舊版 pending/waitlist/rejected 資料相容表；新版 private participant form 直接寫 tournament JSON，不新增 pending row。

刪除 tournament 目前不會 DB-level cascade 舊 registrations rows。

## 14. Backup / Restore

JSON backup 會包含完整 tournament JSON，因此可能含：

- 電話
- notes
- custom answers
- private registration settings

請視為敏感資料。

Whole-collection restore 是破壞性操作：Worker 會用備份內容取代 tournaments collection。不要拿 automated staging test 或 production deployment 自動執行 restore。

正式部署前若需要高信心：先保留 fresh production backup；發布後只做讀取驗證，除非另有 repair 計畫。

## 15. HTML / XSS 邊界

View 使用 HTML string template，所以任何 user-controlled text 都必須 escaping：

- tournament name
- player name
- venue / notes
- phone / drink display name
- registration custom field labels/values
- error message inserted via HTML

Schedule 有 `src/views/schedule/html-escape.js`；其他 view 也有明確 `escapeText` / `escapeAttribute` 或共用 page header escaping。

`tests/html-escaping.test.mjs` 是基本 regression，但新增 HTML template 時仍需人工判斷 context（text / attribute / URL）。

## 16. 本機預覽

完整隔離預覽：

```bash
node scripts/preview-local.mjs
```

預設：`http://127.0.0.1:8765/`

- 執行真實 `worker/index.js`
- 使用 `.dev-data/local-d1.json`
- 不讀寫 production D1

帶入備份：

```bash
node scripts/preview-local.mjs --reset --backup path/to/backup.json
```

## 17. 測試層級

快速：

```bash
node scripts/test-fast.mjs
```

完整 Node + build：

```bash
node scripts/test-full.mjs
```

含 Chrome：

```bash
node scripts/test-full.mjs --browser=required
```

主要 coverage：

- V2 boundary tests（main/schedule/domain/Worker/CSS）
- API/auth/revision
- public/private privacy transition
- check-in/quick score
- Swiss/ranking/Stage 2
- format matrix
- registration
- HTML escaping
- responsive UI
- backup/data management
- browser tournament flow/full management flow
- Sites build/source SHA

自動測試不能證明「完全沒有 bug」。特別無法完整模擬：

- 大量真實手機同時操作
- 場地網路抖動/AP roaming
- D1/平台部分故障
- 各 iOS/Android browser/Web Bluetooth 差異
- 惡意流量與 brute force

## 18. Staging E2E release gate

Permanent staging：

```text
https://spin-league-test.ckvs4517.chatgpt.site/
```

GitHub Actions `Staging E2E`：

- host hard-lock staging
- 使用 repository secret `STAGING_ADMIN_PIN`
- 必須輸入 exact deployed `expected_sha`
- 建立 `[E2E]` 賽事
- 做真實 UI + Test D1 writes
- cleanup 只允許刪 `[E2E]` 賽事
- 檢查 pre-existing Test D1 tournament IDs 沒被破壞

只有 source SHA 正確、CI 綠、live staging E2E 綠，才可當作 release candidate。

## 19. ChatGPT Sites build

```bash
node scripts/build-site.mjs
```

輸出概念：

```text
dist/
├─ client/
│  ├─ index.html
│  └─ src/
│     └─ styles/app.css     # build-time flattened single stylesheet
├─ server/
│  ├─ index.js
│  ├─ routes/
│  ├─ services/
│  ├─ db/
│  ├─ tournament-domain.js
│  ├─ domain/
│  └─ formats/
└─ .openai/
   ├─ hosting.json
   └─ drizzle/
```

Build 也會把 source Git revision 寫入 build info，頁尾顯示 `GIT xxxxxxx`；staging acceptance 用這個 marker 驗證部署來源。

## 20. 開發工作流程

功能／bug：

```text
找 owning feature/view
→ 找 store/API boundary
→ 找 shared domain / format（若是業務規則）
→ 找 Worker service/db（若是 server/persistence）
→ 補 regression
→ test-fast
→ full/browser test
→ staging deploy
→ exact-SHA Staging E2E
```

架構檢查：

```bash
npm run check:architecture
npm run health
```

不要為了 CI 通過直接提高 monolith size limit 或弱化 boundary test。

## 21. 已知 release 風險／技術債

目前明確保留的限制：

- 所有管理者共用同一 PIN。
- Login 沒有 rate limit / lockout / individual account。
- 沒有每位裁判 audit log。
- private registration 沒有 Turnstile/platform rate limiter。
- live E2E 是單一 browser/admin session，不是真正多手機 soak test。
- collection GET 會解析全部 tournament JSON；歷史資料量很大時需要 summary/pagination 設計。
- backup restore 是 destructive operation。
- battle stadium/arena 不是持久化權限 entity。
- Web Bluetooth 相容性受瀏覽器平台限制。
- `src/views/schedule/decision-panels.js` 已接近 architecture size warning，需要避免繼續塞入不相關責任。

這些限制應記錄與逐步處理，但不能用來忽略已存在的 revision、privacy、backup、staging gate。

## 22. AI 維護文件

| 檔案 | 用途 |
| --- | --- |
| `README.md` | 使用者功能與簡介 |
| `DEVELOPMENT.md` | 目前技術架構與運作 |
| `ARCHITECTURE.md` | architecture contract |
| `AGENTS.md` | 每次 AI task 的短規則與安全界線 |
| `.agents/skills/spin-league-debug/` | debug ownership/invariants |
| `.agents/skills/spin-league-test/` | test matrix / release checks |
| `.agents/skills/spin-league-deploy/` | deployment safety |
| `.agents/skills/spin-league-backup/` | backup/repair safety |
| `V2_RELEASE_REVIEW.md` | V2 上線前 audit 與剩餘風險 |

新增重要 invariant 時，同步更新 regression test 與相關維護文件，不要只靠聊天紀錄。

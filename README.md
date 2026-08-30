# Spin League

Spin League 是一套為戰鬥陀螺活動設計的網頁賽事管理系統。主辦方可以從參賽資料、報到、排程一路管理到記分與完賽；選手與觀眾不需登入即可查看公開活動、賽程、比分與排行榜。

目前 codebase 已完成 V2 架構重構 Phase 0–5。重構目標是降低大型單檔耦合，不改變既有賽事資料格式或 D1 schema；正式功能的下一個主要開發項目是 Scoring V2。

## 主要功能

### 主辦方／裁判

- 建立、編輯、複製與刪除賽事
- 活動日期、時間、地點、地圖、貼文與備註
- 手動建立名單，或建立只交給已確認參賽者的私密資料填寫連結
- 編輯參賽者名稱、電話、飲品與參賽資料
- 現場搜尋／篩選、單人或全員報到、快速新增選手
- 產生排程並在正式開始前調整首輪配對
- 支援 1～8 台戰鬥台安排一般輪次
- 正式比分、快速登分、棄賽、未出席、中途退賽、重賽
- 瑞士制 Top 4 / Top 8 與第二階段模式選擇
- JSON 備份、CSV 匯出與個人戰績 PNG

### 選手／觀眾

- 不登入查看公開賽事、時間地點與注意事項
- 查看目前輪次、比分、晉級結果、排行榜與歷史對戰
- 使用不影響正式賽事的獨立記分板
- 在支援 Web Bluetooth 的瀏覽器使用 SpinLab / Battle Pass 相關功能

## 支援賽制

### 單淘汰

- 2～48 位已報到選手
- 輸一場淘汰
- 奇數人／奇數輪支援輪空處理

### 瑞士制

- 4～48 位已報到選手
- 第一階段固定四輪
- 可使用傳統排名或對手強度（Buchholz）排名規則
- 建立賽事時先選 Top 4 / Top 8 晉級人數
- 資格線同分時可建立 qualification 決定賽
- 第一階段結束後再決定第二階段模式
- Top 4 可使用循環賽或單淘汰
- Top 8 可使用循環賽、單淘汰或另一組瑞士輪
- 第二階段瑞士輪可在開始前設定輪數
- 未晉級選手仍保留完整第一階段成績與歷史對戰

### 循環賽

- 3～8 位已報到選手
- 每人互打一次
- 並列第一可建立冠軍 tie-break series

### 連勝制

- 3～8 位已報到選手
- 勝者守擂、敗者回到隊尾
- 依目前規則達到目標連勝者奪冠

## 主辦方基本流程

1. 輸入主辦方 PIN 登入管理模式。
2. 建立賽事並設定賽制、活動資訊與戰鬥台數。
3. 手動加入選手，或將私密參賽資料連結交給已確認資格的選手。
4. 現場搜尋、確認名單並完成報到。
5. 進入排程；未報到者會標記 `no_show` 且不進正式賽程。
6. 隨機產生排程，需要時調整首輪配對，再正式確認開賽。
7. 只對「可開始」的 match 記分；平手不能送出，勝方至少 4 分。
8. 完賽後確認排行榜、匯出備份／CSV／戰績圖。

## 多裝置與同步

不同裁判裝置可以操作同一場賽事。每次正式寫入都帶 tournament revision；如果另一台裝置已先更新，舊 revision 不會直接覆蓋新版資料。

前端也使用 ETag 輪詢減少未變更資料的重複傳輸。這不是 WebSocket realtime push，因此多人同時操作時仍建議每位裁判處理自己負責的 match，並確認儲存成功。

目前所有管理者仍共用同一組 PIN，尚未提供個別裁判帳號、每台戰鬥台權限或操作 audit log。

## 個資與公開資料

Tournament 內部資料可能包含：

- 參賽者電話
- 私人備註
- 自訂欄位答案
- 私密參賽資料連結 token

這些不是公開資料。未登入的 `/api/tournaments` 與 `/api/tournaments/:id` 只回傳 public-safe tournament，不包含 `participantDetails` 或 `registrationSettings.token`。

登入管理模式後，系統才重新取得完整資料；登出時會立即從目前瀏覽器記憶體移除上述私密欄位。

JSON 備份與部分管理用 CSV 仍可能包含電話等個資，下載後請限制存取。

## V2 Codebase

V2 不改成大型前端框架，而是保留 browser-native ES Modules，將原本大型檔案依責任拆開：

```text
src/main.js                         thin coordinator
src/features/*                     interactions/controllers
src/views/schedule/*               schedule rendering
src/domain/tournament.js           stable facade
src/domain/tournament/*            tournament business modules
src/data/store.js                  browser API/state/revision/ETag
worker/index.js                    thin Worker entry
worker/routes/*                    HTTP coordination
worker/services/*                  server validation/actions/auth
worker/db/*                        D1 persistence
src/styles/app.css                 ordered source manifest
src/styles/base|features|responsive/*
```

Source CSS 是模組化的；Sites build 會重新合成單一 deployed `app.css`，避免活動現場因樣式分檔增加多次 network request。

完整技術文件：

- [DEVELOPMENT.md](DEVELOPMENT.md)
- [ARCHITECTURE.md](ARCHITECTURE.md)
- [V2_RELEASE_REVIEW.md](V2_RELEASE_REVIEW.md)

## 本機開發

```bash
git clone https://github.com/ckvs4517/Race_system.git
cd Race_system
npm install
node scripts/preview-local.mjs
```

預設開啟：

```text
http://127.0.0.1:8765/
```

本機預覽使用 `.dev-data/` 隔離資料，不會連線或修改 production D1。

帶入一份備份到本機：

```bash
node scripts/preview-local.mjs --reset --backup path/to/backup.json
```

## 測試

常用：

```bash
npm run health
node scripts/test-fast.mjs
node scripts/test-full.mjs --browser=required
```

測試包含：

- V2 architecture boundaries
- tournament formats / ranking / Stage 2
- API / authorization / revision conflict
- public/private data boundary
- registration / check-in / quick score
- HTML escaping
- responsive/browser flows
- Sites build/source Git marker

### Staging release gate

永久測試站：

```text
https://spin-league-test.ckvs4517.chatgpt.site/
```

正式候選版需先部署到 staging，再手動執行 GitHub Actions `Staging E2E`，並填入「測試站實際部署的 exact Git SHA」。Workflow 會拒絕非 staging host，使用獨立 Test D1，測試完成後只清理自己的 `[E2E]` 賽事。

CI／Staging E2E 通過代表目前自動化範圍沒有發現問題，不代表所有真實手機、弱網路、D1 故障或惡意流量情境都已被模擬。

## 目前已知限制

- 主辦方／裁判共用 PIN，尚無個人帳號與 audit log。
- Login 與私密參賽資料提交尚無平台 rate limit / Turnstile。
- 同步是 polling + optimistic revision lock，不是 realtime push。
- Live staging E2E 是單一 browser session，不是真正多裝置長時間 soak test。
- 歷史賽事大量增加後，公開 tournament collection 可能需要 summary/pagination 優化。
- JSON restore 是破壞性的整批 tournament replacement，正式使用前必須確認備份。
- Web Bluetooth 支援度依瀏覽器與平台而異。

## 賽事規則參考

Repository 內附 Beyblade X 賽事規則 PDF。網站實際行為以目前 code 與 tests 已實作的規則為準，不代表官方規則的所有細節都已自動判定。

## 授權

Repository 目前沒有明確 `LICENSE`。公開可讀不等於自動允許修改、再散布或商業使用。

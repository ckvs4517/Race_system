# Implementation Plan：Issue #82 首輪配對方式

本文件是 Issue #82 的非規範性 code 修改計畫。正式需求以同目錄 `spec.md` 為準。

## 1. Domain：允許手動 pairs 建立第一份 opening round

### `src/domain/tournament/lifecycle.js`

目標函式：

- `updateOpeningPairings()`

目前限制：

```js
if (!normalized.rounds.length) throw new Error('請先隨機分組。');
```

規劃：

1. 移除此「必須先 randomize」限制。
2. 先取得 `format = getTournamentFormat(normalized.format)`。
3. 若 `format.supportsOpeningPairingEdit === false`，直接拒絕手動 opening pairing。
4. 無論目前是否已有 `rounds[0]`，都用 `validateOpeningPairs(pairs, activePlayers)` 驗證完整輸入。
5. 依既有 `format.createOpeningRound()` 取得 metadata template。
6. 將 clean pairs 套入 template matches。
7. 正確保留／建立：
   - match id
   - phase / series metadata
   - bye winner
   - bye status
   - `seedPlayer`
   - `seedReason`
8. 回傳 `rounds: [round]`，保持 `排程中`。

此改法重用既有 domain 邏輯，不新增第二套「manual pairing engine」。

## 2. Worker Action：維持既有 API

### `worker/services/tournament-actions.js`

原則上不需要新增 action。

沿用：

```text
update_opening_pairings
```

Worker 繼續將 pairs 交給 domain 驗證。

若實作時發現 client 可繞過 format capability，防線應放在 domain，不應只放 UI。

## 3. Schedule View：新增配對方式入口

### `src/views/schedule/tournament-detail.js`

目前 `排程中 && rounds.length === 0` 時，primary action 只有：

```text
隨機分組
```

規劃：

1. 對支援 opening pairing edit 的 format：
   - 不再只呈現單一「隨機分組」。
   - 顯示 pairing setup panel，提供：
     - 系統隨機
     - 現場抽籤
2. 對 `supportsOpeningPairingEdit === false` 的 format：
   - 維持現有系統排程入口。
3. 更新 guide / pending copy：
   - 不再寫「請按隨機分組」。
   - 改為「請選擇系統隨機或現場抽籤建立首輪」。
4. opening round 已建立後，維持既有：
   - 確認賽程並開始
   - 重新隨機分組
   - pairing editor

## 4. Pairing UI：讓空排程也可以輸入 pairs

### `src/views/schedule/participant-panels.js`

目前：

`pairingEditorView()` 只有在 `tournament.rounds[0].matches` 已存在時才 render。

規劃：

### 方案

新增或拆分：

- `pairingSetupView()`
- `pairingEditorView()`

其中：

#### pairingSetupView

在：

- Admin
- `status === 排程中`
- `rounds.length === 0`
- format 支援 opening pairing edit

時 render：

- 「系統隨機」button
- 「現場抽籤」button
- 可展開的 manual pairing form

#### pairingEditorView

支援兩種來源：

1. 已存在 opening round：
   - 用目前 match values 當 selected。
2. 尚未存在 opening round：
   - 依 active player count 建立 `Math.ceil(count / 2)` 個空白 pairing rows。
   - select 先提供「尚未選擇」placeholder。
   - 奇數人時 playerB 選項允許一個 `輪空`。

提交後仍使用同一個 `data-opening-pairings-form` 與 `update_opening_pairings` action。

## 5. Controller：支援現場抽籤 UI

### `src/features/schedule/controller.js`

規劃：

1. `prepare_tournament_schedule` 成功 toast：
   - 由「請進行隨機分組」
   - 改為「請選擇系統隨機或現場抽籤建立首輪」。
2. 保留既有 `randomize-schedule` handler。
3. 新增「現場抽籤」UI toggle handler：
   - 僅控制 DOM 顯示；
   - 不寫入 tournament JSON。
4. pairing select 的 duplicate helper：
   - 忽略空白 placeholder；
   - 不把尚未完成的空白選項誤判成 duplicate。
5. pairing form submit：
   - 沿用 `update_opening_pairings`。
6. 成功後由 store/server 回傳 tournament，正常 rerender 成已存在 opening round 的排程畫面。

## 6. Styles

優先重用現有：

- `pairing-editor`
- `button`
- schedule panel styles

若需要新增少量 pairing-method layout：

### `src/styles/features/schedule.css`

放一般 layout / card style。

### `src/styles/features/schedule-responsive.css`

只放 mobile / narrow breakpoint 調整。

不得把功能-specific general style 全塞進 responsive stylesheet。

## 7. Tests

### `tests/tournament.test.js`

新增 domain regression：

1. Single Elimination：
   - `prepareTournamentSchedule()` 後 `rounds=[]`。
   - 直接 `updateOpeningPairings()` 成功建立首輪。
2. Swiss：
   - 同樣可直接建立第一輪。
3. duplicate player 被拒絕。
4. missing player 被拒絕。
5. self-match 被拒絕。
6. odd player 無 bye 被拒絕。
7. even player 有 bye 被拒絕。
8. Round Robin manual opening pairs 被拒絕。
9. Win Streak manual opening pairs 被拒絕。

### `tests/api.test.mjs`

保留目前「randomize → adjust → confirm」測試。

另外增加一場 API tournament：

```text
check-in
→ prepare_tournament_schedule
→ update_opening_pairings（不 randomize）
→ confirm_tournament_schedule
```

確認 Worker action 無法繞過 domain validation。

### `tests/check-in.test.mjs`

對支援 format 驗證：

- 進入 `排程中` 後同時出現：
  - 系統隨機
  - 現場抽籤
- 尚未有 round 時可以 render manual pairing input。
- unsupported format 不出現現場抽籤。

### `tests/full-flow.test.js`

建議把完整 UI flow 改為至少走一次「現場抽籤」：

```text
確認報到
→ 現場抽籤
→ 填完整 pairs
→ 儲存
→ 確認賽程
→ 開始記分
```

既有 random path 由 domain/API regression 繼續保護。

### Staging E2E

既有 staging script 目前仍透過 `data-action="randomize-schedule"`。

V1 應保留此 selector，避免為本功能不必要地破壞 release E2E。

若後續要把現場抽籤納入 staging destructive browser E2E，再獨立擴充，不是本次必要條件。

## 8. 不需要修改

預期不需要：

- D1 schema
- tournament normalization
- public API shape
- ranking engine
- scoring engine
- release contract
- backup format

## 9. 建議實作順序

1. 先補 domain tests。
2. 修改 `updateOpeningPairings()`。
3. 補 API regression。
4. 修改 schedule view / pairing editor。
5. 修改 controller interaction。
6. 補 UI/full-flow tests。
7. 執行：
   - `npm run check:architecture`
   - focused tests
   - `node scripts/test-fast.mjs`
   - `node scripts/test-full.mjs`
   - browser test（需要時）
8. 功能驗收後更新 `spec/current/tournament-lifecycle.md`。
9. 依正式 release gate 再決定 staging / production，不因 code 完成自動部署。

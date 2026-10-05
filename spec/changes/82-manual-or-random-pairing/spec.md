# Change Spec：首輪配對方式支援「系統隨機」與「現場抽籤」

Related issue: #82  
Status: implemented

## 目標

Spin League 在正式排程階段提供兩種清楚的首輪配對入口：

1. **系統隨機**：沿用現有由系統產生首輪配對的流程。
2. **現場抽籤**：主辦方先用撲克牌、猜拳、黑白等實體方式完成抽籤，再直接把結果輸入 Spin League。

本功能的核心不是新增新的抽籤演算法，而是讓 Spin League 能忠實記錄現場已決定的首輪結果，同時保留既有的 server-side 驗證與正式賽程確認流程。

相關 current specs：

- `spec/current/tournament-lifecycle.md`
- `spec/current/formats-and-ranking.md`
- `spec/current/sync-and-persistence.md`

## 不在本次範圍

- 螢幕抽籤動畫或主持模式。
- 新的隨機演算法。
- Round Robin 的手動逐場首輪配對。
- Win Streak 的手動逐場首輪配對。
- 修改第二輪之後的 pairing algorithm。
- 修改正式賽事開始後的歷史 rounds。
- 新增 `pairingMode`、`drawMethod` 等 tournament persistence 欄位。
- D1 schema migration。

## 目前行為

目前流程為：

```text
確認報到
→ prepare_tournament_schedule
→ tournament.status = 排程中
→ rounds = []
→ 必須執行 randomize_schedule
→ 系統建立 opening round
→ 可透過 update_opening_pairings 手動調整
→ confirm_tournament_schedule
→ 正式開始
```

目前 `updateOpeningPairings()` 雖然已具備完整首輪配對驗證與重建能力，但會在 `rounds` 為空時直接拒絕，因此現場抽籤仍必須先做一次系統隨機。

## Requirements

### PAIR-001 — 排程階段提供兩種入口

當 tournament 已進入 `排程中` 且尚未建立 opening round 時，如果該 format 支援 opening pairing edit，管理端必須提供：

- 「系統隨機」
- 「現場抽籤」

兩種清楚可辨識的首輪配對方式。

目前支援現場抽籤的 format 為：

- Single Elimination
- Swiss 第一輪

### PAIR-002 — 系統隨機維持既有行為

當管理員選擇「系統隨機」時，系統必須繼續使用既有 `randomize_schedule` server-authoritative action 建立 opening round。

既有 randomization、bye、format opening-round 邏輯不得因本功能改變。

### PAIR-003 — 現場抽籤不得先做系統隨機

當管理員選擇「現場抽籤」時，系統必須允許在 `rounds = []` 的狀態直接輸入完整首輪 pairs。

不得要求先呼叫 `randomize_schedule`。

### PAIR-004 — 現場抽籤輸入必須完整

現場抽籤 UI 必須要求輸入完整 opening round。

送出前端資料後，domain/server 必須驗證：

- 每位 active player 剛好出現一次；
- 不得重複選手；
- 不得遺漏選手；
- 選手不得與自己對戰；
- 偶數人不得安排 bye；
- 奇數人必須且只能安排一位 bye；
- bye 只能出現在支援的對戰位置。

未通過驗證時不得建立 opening round。

### PAIR-005 — Domain 必須是最終驗證者

前端可以提供重複選手提示、placeholder 與選項限制，但不能依賴前端保證 pairing 正確。

`update_opening_pairings` 的 domain/server 驗證仍是正式資料寫入前的最終防線。

### PAIR-006 — 現場抽籤直接建立正式候選 opening round

當有效的現場抽籤 pairs 送出時，`updateOpeningPairings()` 必須可以在尚未存在 rounds 的情況下：

1. 取得目前 active players；
2. 驗證完整 pairs；
3. 依 format 的 opening-round template 建立 round metadata；
4. 套用現場抽籤的 playerA / playerB；
5. 正確建立 bye winner / status；
6. 將該 round 保存到 tournament；
7. 維持 tournament status 為 `排程中`。

此時尚未正式開賽。

### PAIR-007 — 正式確認流程不變

不論 opening round 來自系統隨機或現場抽籤，最後都必須使用既有：

`confirm_tournament_schedule`

進入正式比賽。

確認後：

- tournament 進入 `進行中`；
- opening round 成為正式歷史賽程；
- 不得再使用排程階段功能直接改寫首輪。

### PAIR-008 — 已建立配對仍可在排程階段調整

在 `排程中` 且 opening round 已存在時，支援 opening pairing edit 的 format 必須保留現有「調整首輪對戰」能力。

如果目前 opening round 是系統隨機產生，主辦方仍可手動修改。

如果目前 opening round 是現場抽籤輸入，主辦方也可在正式確認前修正輸入錯誤。

### PAIR-009 — 不支援的 Format 不得接受手動 Opening Pairs

目前：

- Round Robin
- Win Streak

不得開放「現場抽籤」逐場配對入口。

即使 client 直接呼叫 action，server/domain 也必須拒絕 unsupported format 的手動 opening pairing。

原因：

- Round Robin 後續 rounds 由完整 series ordering 推導；
- Win Streak 後續對戰與 queue ordering 綁定。

V1 不應以只修改第一場／第一輪的方式破壞後續賽制狀態。

### PAIR-010 — 不新增永久 Pairing Mode 欄位

本功能不得要求在 tournament JSON 新增永久 `pairingMode` / `drawMethod` 欄位。

正式資料的 source of truth 是 opening round 本身。

「系統隨機」或「現場抽籤」只是在正式賽程建立前的操作方式，不需要為此增加 D1 migration 或歷史資料相容成本。

## UI 行為

### 尚未產生 opening round

對支援現場抽籤的 format，排程區應清楚顯示：

```text
建立首輪配對

[ 系統隨機 ]
由 Spin League 隨機產生首輪對戰

[ 現場抽籤 ]
使用撲克牌、猜拳等方式抽籤後，在這裡輸入結果
```

選擇「現場抽籤」後，顯示完整 pairing editor。

### 已有 opening round

沿用目前：

- 首輪預覽
- 手動調整
- 儲存調整
- 確認賽程並開始
- 重新系統隨機（需要時）

不需要持續顯示「目前模式」。

## 資料／相容性影響

- Existing tournament JSON：無新增欄位。
- D1 / schema migration：無。
- Old backups：無影響。
- Public API：無新增資料。
- Admin API：沿用既有 `update_opening_pairings` action。
- Existing tournaments：無需 normalization 更新。
- Existing random flow：必須保持相容。

## 驗收條件

- [ ] PAIR-001：Single Elimination / Swiss 在空排程階段可看到「系統隨機」與「現場抽籤」。
- [ ] PAIR-002：既有系統隨機流程仍正常。
- [ ] PAIR-003：現場抽籤可以在 `rounds=[]` 直接建立 opening round。
- [ ] PAIR-004：重複、漏人、自打與錯誤 bye 均被拒絕。
- [ ] PAIR-005：直接呼叫 Worker action 也無法繞過 pairing validation。
- [ ] PAIR-006：有效現場抽籤後仍維持 `排程中`。
- [ ] PAIR-007：兩種來源最後都透過既有 confirm action 正式開賽。
- [ ] PAIR-008：正式開始前仍能修正首輪 pairs。
- [ ] PAIR-009：Round Robin / Win Streak 不顯示現場抽籤，server 也拒絕手動 opening pairing。
- [ ] PAIR-010：沒有新增 tournament persistence 欄位或 D1 migration。
- [ ] Architecture checks、focused tests、full tests 通過。
- [ ] 需要發布時依既有 Local → Staging → Staging E2E → Production approval 流程處理。

## Current Spec 更新

功能實作並驗收後：

1. 更新 `spec/current/tournament-lifecycle.md` 的 LIFE-004：
   - 「排程階段可以透過系統隨機或支援的手動 opening pairing 建立首輪」。
2. `spec/current/formats-and-ranking.md` 不修改排名規則，只在必要時補充各 format 的 opening-pairing capability。
3. 本 Change Spec 狀態改為 `implemented` 或 `archived`。

## 剩餘風險

- Round Robin 若未來要支援現場抽籤，應設計「抽選手順序／座號」而不是只輸入第一輪 pairs。
- Win Streak 若未來要支援現場抽籤，應設計「抽出場 queue」。
- 螢幕抽籤與更強的儀式感流程留待獨立 Change Spec。


## 實作結果

已於 PR #83 完成實作並通過 GitHub Actions `Test and build`。

目前狀態：待合併至 `main`，尚未部署 Staging / Production。

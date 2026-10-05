# Current Spec：賽事生命週期

狀態：目前正式行為基準。

主要實作位置：`src/domain/tournament/lifecycle.js`、`src/domain/tournament/roster.js`、各 format module，以及 Worker tournament actions。

## 範圍

本規格定義 tournament record 從準備、排程、正式比賽到完成的生命週期行為。

## Requirements

### LIFE-001 — 標準生命週期狀態

一場賽事必須使用以下頂層狀態：

```text
準備中 -> 排程中 -> 進行中 -> 已完成
```

Swiss qualification/final、Round Robin tie-break 等賽制內部階段可以存在於正式賽事流程中，但不得取代上述頂層 tournament status contract。

### LIFE-002 — 結構性編輯僅限 Draft

當 tournament 為 `準備中` 時，可以在通過驗證的前提下修改名單、參賽者資料、活動設定、賽制、registration settings 與其他 draft configuration。

當 tournament 已進入排程或正式比賽後，不得再透過整包 draft 編輯改寫正式賽果。

### LIFE-003 — 報到狀態決定參賽資格

當賽事進入排程時：

- 已報到參賽者必須成為可正式配對的 active competitor；
- 未報到參賽者必須標記為 `no_show`；
- `no_show` 不得進入正式配對。

完整正式名單仍必須保留。

### LIFE-004 — 排程是獨立階段

當 `prepare_tournament_schedule` 成功時：

- tournament 必須進入 `排程中`；
- 正式賽果相關狀態必須為新賽程重置；
- 私密參賽資料填寫功能必須撤銷／關閉。

只有排程階段可以建立或調整開場賽程。支援手動 opening pairing 的賽制可以選擇由系統隨機產生，或直接輸入現場抽籤結果；不支援手動 opening pairing 的賽制仍由系統依賽制規則產生。

### LIFE-005 — 確認賽程後正式開始比賽

當有效賽程被確認後：

- tournament 必須進入 `進行中`；
- opening round 必須成為正式歷史賽程；
- format 統計必須以該賽程為基礎初始化。

### LIFE-006 — 已產生的賽程屬於歷史資料

已經產生的 rounds 必須視為歷史賽事資料。

後續演算法或軟體更新不得默默重新產生已完成或已建立的歷史 rounds。

任何會讓後續歷史失效的操作，都必須透過明確支援的 replay / repair 行為處理。

### LIFE-007 — 修改早期結果必須維持一致性

當較早的 match 被 replay 或失效時，所有因此不再可信的後續結果都必須被明確清除、重新產生、阻擋，或由支援的 Repair Flow 處理。

系統不得留下已知與上游結果矛盾的 bracket 或 ranking 狀態。

### LIFE-008 — 提前結束賽事

當進行中的 tournament 被明確提前結束時，只有在目前第一名可唯一確定時，才可以依目前 standings 決定 champion。

如果第一名仍然並列，`champion` 必須保持未決。

### LIFE-009 — 複製賽事會建立新的 Draft

當 tournament 被複製時，新賽事必須是新的 draft competition，而不是正式 match history 的複本。

可重用的設定可以複製，但正式 rounds / results 必須透過正常生命週期重新產生。

## 相容性限制

- 既有 tournament JSON 必須可透過 normalization 繼續讀取。
- 除非有明確核准的 migration，生命週期修改不得要求重寫 production D1 records。
- Public 使用者不得因任何生命週期轉換而取得正式 mutation 權限。

## 驗證依據

相關回歸驗證包含 lifecycle/domain tests、format tests、action/API tests、staging E2E，以及 `.agents/skills/spin-league-debug/references/invariants.md` 中的 invariants。

# Current Spec：記分與歷史比分修正

狀態：目前正式行為基準。

主要實作位置：`src/domain/tournament/matches.js`、`score-validation.js`、`score-correction.js`、各 format module，以及 `worker/services/tournament-actions.js`。

## 正式記分 Requirements

### SCORE-001 — 正式賽果由 Server Authoritative Action 執行

當管理員記錄比分、判定棄賽、重賽、修正或 Repair 正式比賽時，該 mutation 必須透過 server-authoritative tournament action 執行。

已開始的 tournament 不得信任 client 提交預先算好的替代 bracket 或 champion。

### SCORE-002 — 有效最終比分

已完成的正式比賽比分必須為非負整數。

平手不得確認。

勝方最終分數必須至少為 4 分。

### SCORE-003 — 勝者一致性

當一場比賽完成時：

- `winner` 必須與比分較高的選手一致；
- 必須保留完成時間戳記。

### SCORE-004 — 只允許目前可記分的比賽

一般比分輸入只能套用在目前賽制判定為可進行的 match。

系統必須拒絕使用一般比分輸入去改寫已完成的歷史 rounds。

### SCORE-005 — 行政判定結果

Forfeit 或 withdrawal 結果必須保留明確的 outcome / reason metadata。

一般比分修正不得默默取代既有行政判定。

### SCORE-006 — Scoring Event 明細

當支援的記分流程提供 structured scoring events / scoring source 時，正式賽果可以保留該明細。

如果後續歷史比分修正使既有 scoring-event history 不再一致，舊事件資料必須被移除或標記為 invalid，不得繼續當作正式依據顯示。

## 歷史比分修正 Requirements

### REPAIR-001 — 套用前先分析影響

已完成比賽的比分修正必須先做 impact classification。

目前模型分為：

- Level 0：可安全直接修正；
- Level 1：會改變受保護排名／狀態，但可透過 Repair Flow 處理；
- Blocked：會影響目前 Repair Flow 無法安全重建的 bracket / stage，因此不支援。

### REPAIR-002 — Level 0 修正

當比分可以修改，且不會改變受保護的 bracket / ranking state 時，系統可以直接套用修正。

單淘汰只有在 winner 與 bracket path 都不改變時，單純比分數字修改才屬於 Level 0。

### REPAIR-003 — Level 1 Repair

當支援的 Round Robin 或 Swiss 歷史比分修正會改變 winner / ranking / tournament state 時，系統可以使用明確的 Repair Flow。

Level 1 Repair 必須要求非空白的修正原因，並追加可稽核的 repair-history entry。

### REPAIR-004 — 保留未受影響的已產生賽程

當支援的 repair model 判定後續 rounds 結構仍安全時，Repair 必須保留已產生的 downstream rounds。

已完成的後續 rounds 應被標示為 locked / preserved context，而不是默默重新產生。

### REPAIR-005 — 不支援的 Repair 必須阻擋

系統必須阻擋目前 repair model 無法安全 reconcile 的歷史比分修正。

目前包含：

- 單淘汰中會改變晉級 winner 的修正；
- Win Streak 中會改變 winner / streak state 的修正；
- 尚未支援的 Swiss Stage 2 / placement 修正；
- 尚未由 Repair Flow 支援的 Round Robin tie-break winner-changing 修正。

### REPAIR-006 — Repair History 屬於管理資料

`repairHistory` 屬於行政／管理端資料。

未登入的 public tournament representation 不得暴露 `repairHistory`。

### REPAIR-007 — Replay 與 Score Correction 是不同操作

Replay/reset 與 score correction 必須視為不同操作。

當 replay 較早的已完成比賽可能使 downstream rounds 失效時，後續狀態必須依賽制規則明確失效，而不能把它當作單純比分編輯。

## 相容性限制

- 歷史比分修正不得在沒有明確 admin action 的情況下修改 production data。
- 不支援 score correction 的舊 tournament version 必須安全失敗，不得猜測修正方式。
- 多裁判並行操作時，正式記分 action 必須維持 revision-safe。

## 驗證依據

相關 coverage 包含 score validation、replay / correction / repair tests、format tests、action synchronization tests、API tests 與 staging E2E。

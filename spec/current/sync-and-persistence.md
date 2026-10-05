# Current Spec：同步與資料持久化

狀態：目前正式行為基準。

主要實作位置：`src/data/store.js`、Worker routes/services/db、D1 persistence、同步相關 tests 與 API tests。

## Persistence Requirements

### SYNC-001 — Tournament 儲存模型

D1 必須將每場 tournament 保存為 tournament JSON document 加上一個 numeric revision。

正式寫入的正確性必須依賴 revision checking，而不能只依靠 client cache state。

### SYNC-002 — Optimistic Compare-and-Swap

正式 mutation 必須攜帶該操作所依據的 revision。

只有當 D1 中的 stored revision 仍與 expected revision 相同時，Worker 才能 commit mutation。

寫入成功時 revision 必須原子性地遞增。

### SYNC-003 — Conflict Response

當 expected revision 已過期時：

- server 必須拒絕該 write；
- 必須回傳或允許重新取得最新 tournament state；
- stale client 不得覆寫較新的 record。

### SYNC-004 — Safe Retry

只有在操作可安全重新套用到最新 revision 時，client 才可以自動 retry conflict，而且最多一次。

如果無法保證安全重新套用，使用者必須先看到更新後狀態，再重新確認操作。

### SYNC-005 — Server-authoritative Actions

Started / completed tournament 的正式結果修改必須使用 server-authoritative action endpoint。

Whole-tournament replacement 不得作為正式記分 mutation 的一般機制。

### SYNC-006 — ETag Polling

GET tournament request 可以使用 ETag 並收到 `304 Not Modified`。

304 不得替換 local tournament state，也不得造成不必要 rerender。

ETag 只是 read optimization，不得取代 write 所需的 revision check。

### SYNC-007 — Request Timeout / Lock Release

Browser API request 必須有明確 timeout 邊界，避免行動網路或瀏覽器 fetch 卡住後永久占用同步 UI / in-flight lock。

### DATA-001 — 向後相容 Normalization

舊版 tournament JSON 在目前支援範圍內必須可於讀取時 normalization。

相容性修正應優先透過 derived normalization / recalculation 處理，而不是破壞性重寫 production records。

### DATA-002 — Restore 是例外操作

Whole-collection restore 只能作為明確的 recovery / restore operation 使用。

Production restore 前必須先有 fresh backup 與明確 operator intent。

Automated tests 不得把 restore 或 destructive flow 指向 production D1。

### DATA-003 — Application Release 不得破壞 Production Data

一般 application deployment 不得 reset、replace、migrate away 或默默重寫 production tournament data。

## 驗證依據

相關 coverage 包含 `sync.test.mjs`、action-sync/API tests、privacy transition、backup/data-management tests、deployment smoke 與 staging E2E。

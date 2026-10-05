# Current Spec：隱私與管理權限

狀態：目前正式行為基準。

主要實作位置：`src/domain/tournament/visibility.js`、`src/data/store.js`、Worker auth/routes/services、API/privacy tests 與 deployment smoke tests。

## Requirements

### PRIV-001 — Public Tournament Projection

未登入的 tournament response 必須使用 public-safe representation。

Public representation 不得暴露：

- `participantDetails`；
- `registrationSettings.token`；
- `repairHistory`。

公開賽程、選手名稱、比分、standings、活動資訊，以及安全的 registration settings 可以維持公開。

### PRIV-002 — Admin Representation

有效的 admin session 可以取得 tournament 管理所需的完整 representation。

所有 administrative mutation endpoint 必須要求有效 authorization。

### PRIV-003 — Login Transition

當 admin login 成功後：

- client 必須清除不相容的 public tournament cache validators；
- 必須重新載入完整 tournament data。

先前快取的 public response 不得阻止 authenticated client 取得 private admin fields。

### PRIV-004 — Logout Transition

當 administrator 登出時：

- private participant data；
- private registration token；

必須立即從 browser in-memory state 移除。

不能因為這些 private tournament objects 曾經被抓取過，就在登出後繼續留在可存取 state 中。

### PRIV-005 — ETag Separation

Public 與 authenticated/admin tournament representation 的 ETag 行為不得共用到可能造成以下情況：

authenticated request 需要 private data，卻因 public cache validator 收到 `304 Not Modified`。

### PRIV-006 — Public 頁面唯讀

Public tournament page 不得執行正式 tournament mutation。

Standalone scoreboard 不得修改正式 tournament data。

### PRIV-007 — User-controlled HTML

任何 user-controlled tournament / participant / registration text 若要插入 HTML string template，都必須依正確 context 做 escaping。

### PRIV-008 — Secrets 與個資

以下內容不得 commit 進 repository：

- 真實 admin PIN；
- session token；
- registration token；
- participant phone number；
- private notes / answers；
- production backup。

## 已知限制

目前系統仍使用共用 organizer/admin PIN，尚未提供 individual judge account / audit identity，也不是所有相關 endpoint 都有 platform-level rate limiting。

這些是已知風險，不代表可以降低既有 privacy boundary。

# Current Spec：參賽者、報到與私密資料填寫

狀態：目前正式行為基準。

主要實作位置：`src/domain/tournament/participant-model.js`、`roster.js`、`registration.js`、`registration-settings.js`、drinks domain、registration views/routes 與相關 tests。

## 名單 Requirements

### PART-001 — 正式名單

`players` 必須代表完整正式參賽名單，且不得包含重複 player name。

參賽者 lifecycle / check-in 狀態必須獨立存放於 `participantStates`。

私密參賽者資料必須獨立存放於 `participantDetails`。

### PART-002 — Participant States

支援的 participant state 語意包含：

- `active`：可參與後續正式配對；
- `no_show`：從未完成報到，不得進入正式配對；
- `withdrawn`：曾報到或參賽，之後退出；歷史結果仍保留。

### PART-003 — Draft 名單編輯

新增、改名、移除或修改 participant details 這類 draft operation，只能在 tournament 為 `準備中` 時執行。

Draft roster mutation 必須一致地重建相關 draft state，不得留下 orphan participant state / details。

### PART-004 — 報到

Check-in 必須決定 roster participant 在排程開始時是否成為 active competitor。

排程開始時仍未報到的 participant 必須轉為 `no_show`。

## 私密參賽資料填寫 Requirements

### REG-001 — 功能定位

Registration link 是提供給已在系統外確認參賽資格者使用的私密 participant-information form。

Spin League 不得把此流程當成公開售票、付款、退款或對帳系統。

### REG-002 — 接受送出資料

當系統收到有效的私密 registration submission 時：

- Worker 必須驗證最新 tournament state 與 token；
- participant 必須直接加入正式 draft roster；
- 不需要第二次人工核准。

### REG-003 — 名額與唯一性

當 tournament 已達設定 capacity 時，submission 必須拒絕。

當 player name 已存在正式 roster 時，submission 必須拒絕。

當正規化後的 participant phone 與同一 tournament 其他 participant 重複時，submission 必須拒絕。

### REG-004 — 聯絡資料

私密 registration submission 必須依目前 normalization / validation rule 提供有效聯絡電話。

Notes / custom answers 可以保存為 private participant details，但必須受既有 validation 與大小限制約束。

### REG-005 — 飲品選擇

Drink data 屬於 `participantDetails`，不屬於 attendance state。

當飲品功能啟用或 submission 有提供飲品時，該 selection 必須能依 tournament 當下的 drink settings 正確 resolve。

後續菜單設定即使修改，歷史 display data 仍必須可讀。

### REG-006 — Registration Settings 屬於 Draft 設定

Registration settings 只能在 tournament 為 `準備中` 時修改。

當私密 registration 被關閉時，舊 token 必須撤銷／更換，使舊 URL 失效。

當排程開始時，registration 必須撤銷／關閉。

### REG-007 — 舊版 Registration 相容性

Legacy registration-table workflow 可以保留作為相容層，但目前的 private participant-information flow 不得要求 participant 在加入正式 roster 前經過 pending / approved / rejected 審核流程。

## 相容性限制

- 沒有 participant details 或 drink data 的舊 tournament 必須可透過 normalization 正常讀取。
- Registration 修改必須維持目前 tournament JSON compatibility，除非另有明確核准 migration。
- Phone、notes、answers、drinks 與 registration tokens 均屬 private/admin data。

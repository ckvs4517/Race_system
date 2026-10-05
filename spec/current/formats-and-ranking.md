# Current Spec：賽制與排名

狀態：目前正式行為基準。

主要實作位置：`src/formats/`、`src/domain/ranking/`、`src/domain/tournament/standings.js` 與相關 tests。

## 跨賽制 Requirements

### RANK-001 — 報到者優先於 No-show

所有已報到參賽者都必須排在標記為 `no_show` 的參賽者之前，即使該已報到參賽者為 0 勝。

實際參賽後的敗場，不得使該參賽者排名低於從未報到的人。

### RANK-002 — 歷史賽果必須保留歸屬

參賽者在出賽後 withdrawal，不得刪除或改寫其歷史 match results。

排名與統計必須使用該賽制／階段所對應的歷史 rounds 衍生，而不是重寫舊結果。

## Single Elimination

### FMT-SE-001

只有 active winner 可以晉級。

Bye 不得視為實際進行的一場比賽，但該賽制可以在晉級／統計模型中計入 bye。

### FMT-SE-002

當一輪完成後仍有多於一位 active winner 時，下一輪必須由這些 winners 產生。

當只剩一位 active winner 時，該選手必須成為 champion。

### FMT-SE-003

單淘汰 standings 必須依序優先考慮：

1. attendance group；
2. champion status；
3. wins；
4. total points；
5. score difference；
6. deterministic name order。

歷史比分修正若會改變 winner，不得直接套用，除非未來已有專用 bracket Repair Flow。

## Round Robin

### FMT-RR-001

Round Robin 必須支援 3–8 位 active players，並在標準系列中讓每一組選手互打一次。

奇數人輪次應以休息／bye 表示，不得建立假的「選手 vs 輪空」計分比賽。

### FMT-RR-002

標準 Round Robin ranking 必須依序優先考慮：

1. attendance group；
2. champion status（適用時）；
3. wins；
4. total points scored；
5. deterministic player-name order。

attendance group、wins 與 total points 完全相同的 rows 必須共用相同 rank。

### FMT-RR-003

當標準循環賽結束後有多位選手並列第一：

- tournament 必須維持未決狀態；
- 系統可以建立只包含符合資格之並列第一名選手的專用 tie-break series。

Tie-break 只能決定該 tie group，不得改寫標準系列歷史。

## Swiss

### FMT-SW-001 — 預賽階段

Swiss V2 必須使用四輪 preliminary rounds。

第四輪 preliminary 完成後，必須進入 qualification，不得默默建立第五輪 preliminary。

### FMT-SW-002 — 各階段統計隔離

Preliminary、qualifier 與 final / Stage 2 統計，必須由各自適用的 rounds 獨立衍生。

進入 qualification 或 Stage 2 後，歷史 preliminary rounds 必須繼續保留。

### FMT-SW-003 — Ranking Rule 相容性

新 tournament 目前預設使用 `legacy_v1`。

`legacy_v1` ranking 必須依序考慮：

1. attendance group；
2. wins；
3. 較少 losses；
4. total points；
5. 原始順序。

既有使用 `buchholz_v1` 的 tournament 必須維持相容。

Buchholz ranking 使用 attendance group、wins、opponent wins、total points，並在支援的兩人同分情境下使用 head-to-head resolution。

### FMT-SW-004 — Qualification

當 preliminary cut 無法唯一決定設定的晉級者時，系統可以建立明確的 qualifier series。

Qualifier 統計必須只使用目前 active qualifier series，不得混入無關的 preliminary / final matches。

### FMT-SW-005 — Stage 2

Stage 2 可以依目前 tournament configuration 使用支援的：

- Round Robin；
- Single Elimination；
- Swiss；
- standings completion。

已產生的 preliminary / qualifier history 必須維持完整。

### FMT-SW-006 — Final Tie Resolution

當設定的 final stage 無法唯一決定必要名次時，系統可以建立明確的 tie-break / placement series。

這些 series 必須以獨立的歷史 phase 表示。

## Win Streak

### FMT-WS-001

Win Streak 必須支援 3–8 位 active players。

勝者必須留在場上，敗者回到 queue 尾端，下一位 challenger 從 queue 中產生。

### FMT-WS-002

當一位選手達成設定的 consecutive-win target 時，該選手必須成為 champion。

目前不支援會改變歷史 winner 的 Repair；此類操作必須阻擋。

## 相容性限制

- Format modules 必須保持 browser / network independent。
- 修改 ranking 行為時必須先建立 Change Spec 並補 regression tests。
- 新演算法部署後，不得默默重新產生既有 generated rounds。

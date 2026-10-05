# Current Spec：Release 與 Deployment 安全

狀態：目前正式行為基準。

正式操作規範來源：`RELEASE_CONTRACT.md`。

本文件提供 feature/change spec 使用的 release 行為摘要。如果本文件與 `RELEASE_CONTRACT.md` 衝突，在完成文件同步前，應以 `RELEASE_CONTRACT.md` 為準。

## Targets

- Local：隔離的本機 preview / test environment。
- Staging：既有 `spin-league-test` Site，使用獨立 Test D1。
- Production：既有 `spin-league-tournament` Site，使用 Production D1。

## Requirements

### REL-001 — Environment Identity

Staging 與 Production 必須維持不同 Site 與不同 D1 database。

Release 不得以 staging database 取代 production，也不得反向混用。

### REL-002 — Exact SHA

Release candidate 必須鎖定一個明確 Git SHA。

Local verification、staging deployment / verification、staging E2E，以及獲准的 production deployment，都必須對應同一個 source revision。

任何 source SHA mismatch 都必須使 release gate 失敗。

### REL-003 — 必須遵守的 Release 順序

Release sequence 必須為：

```text
Local tests/E2E
-> Staging deploy
-> Staging source-SHA verification
-> Staging E2E
-> Production approval
-> Production deploy
-> Production source-SHA verification
-> Read-only Production verification
```

任何較早階段失敗，都必須阻擋後續階段。

### REL-004 — Staging Destructive Test 邊界

Destructive browser E2E 只能針對 `spin-league-test` 與 Test D1。

Workflow 必須 hard-lock，禁止 production target，並保留與 E2E 無關的既有 staging data。

### REL-005 — Production Write Approval

Production publication 必須依目前 release mode 取得明確 operator approval。

CI 或 staging tests 通過本身，不代表取得 production write 權限。

### REL-006 — Production Preservation

一般 production deployment 必須：

- 只更新既有 production Site/version 到獲准 SHA；
- 保留既有 production Site identity；
- 保留 production D1 與 tournament data；
- 保留 repository 既有 hosting identity；
- 不建立 replacement production Site 或 D1；
- 不執行 destructive production E2E；
- 不透過另一個未核准 production write 自動 rollback。

### REL-007 — Production Baseline 與 Verification

Production deployment 前，release flow 必須先取得 read-only baseline，至少包含：

- live source identity；
- tournament IDs / count 等資料完整性資訊。

Deployment 後的 production verification 必須保持 read-only，並確認：

- Site / API 可讀；
- source SHA 正確；
- tournament data 保留；
- smoke / privacy checks 通過。

### REL-008 — Failure Handling

任一 gate 失敗後，後續 release stage 必須停止。

如果 production write 可能已經開始，系統必須安全失敗並要求 operator inspection，不得自動 retry 或 rollback。

## 對開發流程的意義

Feature spec 可以把 local/full tests 與 staging E2E 列為 acceptance gate，但 feature spec 本身不得授權 production deployment。

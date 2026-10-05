# Spin League 規格文件指南

此目錄是 Spin League 輕量、以規格為基準（spec-anchored）的開發流程所使用的規格層。

## 目錄結構

```text
spec/
├─ current/                 # 系統目前應有的正式行為
├─ changes/<issue-or-name>/ # 尚未實作的非小型行為變更
├─ templates/               # 未來 Change Spec 範本
└─ *.md                     # 舊版功能規格，保留作為歷史設計參考
```

## Source of Truth 模型

- `spec/current/`：描述目前產品與 domain 的正式行為。
- `ARCHITECTURE.md`：描述架構邊界。
- `AGENTS.md`：描述開發者與 AI 的操作規則與安全限制。
- Tests：驗證行為與 invariants。
- Code：實作規格所定義的行為。

若 current spec、測試與實際實作互相衝突，不可自行默認其中一份為正確。應先找出差異、確認預期行為，再同步更新規格、回歸測試與實作。

目前直接放在 `spec/` 根目錄的舊版 feature spec 早於這套規則建立。這些文件仍可作為歷史設計參考，但若與 `spec/current/`、測試或目前實作衝突，不應自動視為正式規格。

## Current Specs

- `current/tournament-lifecycle.md`
- `current/scoring-and-repair.md`
- `current/formats-and-ranking.md`
- `current/participants-and-registration.md`
- `current/privacy-and-auth.md`
- `current/sync-and-persistence.md`
- `current/release-and-deployment.md`

這些規格刻意以「domain / workflow 行為」為粒度，而不是每個 function 或 source file 各寫一份 Spec。

## 什麼情況需要 Change Spec

當修改涉及以下任一項目時，應在實作前建立 `spec/changes/<issue-or-name>/spec.md`：

- 記分、排名、配對、賽事生命週期或賽制行為；
- API 行為或 server-authoritative action；
- tournament 資料語意或 persistence；
- 隱私、驗證、public/admin 邊界；
- 多裝置同步或衝突處理；
- 非單純的報名／名單流程；
- release / deployment 安全；
- GitHub Issue 本身不足以清楚定義驗收條件的使用者流程。

通常以下修改不需要額外建立 Change Spec：

- 純文字修正；
- 單純樣式微調；
- 明確 typo；
- 已由 current spec 清楚定義預期行為的小型 regression fix。

## Lightweight SDD 流程

```text
GitHub Issue
  -> Change Spec
  -> Implementation + Regression Tests
  -> CI / Staging verification（需要時）
  -> 將確認後的新行為合併回 spec/current
  -> 保留或封存 Change Spec 作為歷史紀錄
```

## Requirement 寫法

優先使用可觀察、可驗證，並具有穩定 ID 的需求。

例如：

```text
SCORE-003

當管理員確認正式比賽結果時，
系統必須拒絕平手比分，
且勝方最終分數必須至少為 4 分。
```

Requirement ID 在單純文字澄清時應保持不變。只有底層行為本身被取代或移除時，才應更換或退役該 ID。

## 撰寫原則

1. 描述預期行為，不描述逐行實作方式。
2. 只有在架構 ownership 會影響安全實作時，才寫入對應 layer/module。
3. 明確記錄相容性與資料安全需求。
4. 驗收條件應能對應到 regression test。
5. 尚未實作或仍屬構想的行為不要放進 `current/`；應放在 Change Spec 或 GitHub Issue。

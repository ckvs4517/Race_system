# Change Spec：<標題>

Related issue: #<number>
Status: proposed | accepted | implemented | archived

## 目標

用幾句話描述這次修改希望達成的使用者／系統結果。

## 不在本次範圍

- 明確列出與本功能相鄰、但這次不處理的行為。

## 目前行為

只描述理解這次修改所需要的現況。

請連結相關的 `spec/current/*.md`。

## Requirements

使用穩定 Requirement ID。

### CHG-001

當 <條件> 發生時，
系統必須 <可觀察、可驗證的行為>。

### CHG-002

如果 <條件>，
系統必須 <可觀察、可驗證的行為>。

## 設計限制

只記錄會影響安全實作的 constraint，例如：

- owning domain / feature layer；
- server-authoritative action requirement；
- public/admin privacy boundary；
- revision / ETag behavior；
- backwards compatibility；
- 不允許 production data migration。

不要把這一節寫成逐行 coding plan。

## 資料／相容性影響

- Existing tournament JSON：
- D1 / schema migration：
- Old backups：
- Public API：
- Admin API：

## 驗收條件

- [ ] CHG-001 已有 automated regression test。
- [ ] CHG-002 已有 automated regression test。
- [ ] 相關 architecture checks 通過。
- [ ] 相關 focused tests 通過。
- [ ] 需要時已完成 full / browser / staging gates。
- [ ] 未取得明確 approval 前沒有 production deployment。

## Current Spec 更新

功能驗收完成後，列出哪些 `spec/current/*.md` Requirement 需要新增、修改或退役。

## 剩餘風險

記錄本次修改後仍未涵蓋的已知行為或風險。

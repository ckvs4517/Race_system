# Current Spec: Synchronization and Persistence

Status: current behavior baseline.

Primary implementation anchors: `src/data/store.js`, Worker routes/services/db, D1 persistence, synchronization tests, and API tests.

## Persistence requirements

### SYNC-001 — Tournament storage model

D1 SHALL persist each tournament as a tournament JSON document plus a numeric revision.

Formal write correctness SHALL rely on revision checking, not only on client cache state.

### SYNC-002 — Optimistic compare-and-swap

A formal mutation SHALL include the revision it was based on.

The Worker SHALL only commit the mutation when the stored revision still matches the expected revision, and SHALL advance revision atomically on success.

### SYNC-003 — Conflict response

WHEN the expected revision is stale,
THEN the server SHALL reject the write as a conflict and return or allow retrieval of the latest tournament state.

The stale client SHALL NOT overwrite the newer record.

### SYNC-004 — Safe retry

The client MAY automatically retry a conflict at most once only for an operation considered safe to reapply to the latest revision.

WHEN safe reapplication cannot be guaranteed,
THEN the user SHALL be asked to review the refreshed state and perform the action again.

### SYNC-005 — Server-authoritative actions

Started/completed tournament result changes SHALL use server-authoritative action endpoints.

Whole-tournament replacement SHALL NOT be the normal mechanism for formal scoring mutations.

### SYNC-006 — ETag polling

GET tournament requests MAY use ETags and return `304 Not Modified`.

A 304 SHALL NOT replace local tournament state or trigger unnecessary rerendering.

ETags are a read optimization and SHALL NOT replace revision checks for writes.

### SYNC-007 — Request timeout / lock release

Browser API requests SHALL have bounded timeout behavior so a stalled mobile/network request cannot permanently hold synchronization UI/in-flight locks.

### DATA-001 — Backward-compatible normalization

Older tournament JSON SHALL be normalized on read where supported.

Compatibility fixes SHOULD prefer derived normalization/recalculation over destructive rewriting of stored production records.

### DATA-002 — Restore is exceptional

Whole-collection restore MAY replace the tournaments collection only as an explicit recovery/restore operation.

A fresh backup and explicit operator intent SHALL precede production restore.

Automated tests SHALL NOT point restore/destructive flows at production D1.

### DATA-003 — Production data survives application release

Normal application deployment SHALL NOT reset, replace, migrate away, or silently rewrite production tournament data.

## Verification anchors

Relevant coverage includes `sync.test.mjs`, action-sync/API tests, privacy transitions, backup/data-management tests, deployment smoke, and staging E2E.

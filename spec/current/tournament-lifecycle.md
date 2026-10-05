# Current Spec: Tournament Lifecycle

Status: current behavior baseline.

Primary implementation anchors: `src/domain/tournament/lifecycle.js`, `src/domain/tournament/roster.js`, format modules, and Worker tournament actions.

## Scope

This spec defines the lifecycle of a tournament record from preparation through scheduling, active competition, and completion.

## Requirements

### LIFE-001 — Canonical lifecycle states

A tournament SHALL use the lifecycle states:

```text
準備中 -> 排程中 -> 進行中 -> 已完成
```

Format-specific stages such as Swiss qualification/final or round-robin tie-break MAY exist inside the active tournament lifecycle, but SHALL NOT replace the top-level tournament status contract.

### LIFE-002 — Draft-only structural editing

WHEN a tournament is `準備中`,
THEN roster, participant details, event settings, format selection, registration settings, and other draft configuration MAY be edited subject to validation.

WHEN a tournament has entered scheduling or competition,
THEN draft whole-record editing SHALL NOT be used to rewrite formal results.

### LIFE-003 — Check-in determines competition eligibility

WHEN scheduling begins,
THEN checked-in participants SHALL become eligible active competitors,
AND participants who did not check in SHALL be marked `no_show`,
AND `no_show` participants SHALL be excluded from formal pairings.

The full formal roster SHALL remain preserved.

### LIFE-004 — Scheduling is an explicit stage

WHEN `prepare_tournament_schedule` succeeds,
THEN the tournament SHALL enter `排程中`,
formal result state SHALL be reset for the new schedule,
AND private registration SHALL be revoked/closed.

Only scheduling-stage operations may randomize or adjust the opening schedule.

### LIFE-005 — Confirming schedule starts formal competition

WHEN a valid schedule is confirmed,
THEN the tournament SHALL enter `進行中`,
the opening round SHALL become the formal historical schedule,
AND format statistics SHALL be initialized from that schedule.

### LIFE-006 — Generated history is persistent

Already generated rounds SHALL be treated as historical tournament data.

A later algorithm or software update SHALL NOT silently regenerate completed or already-generated historical rounds.

Any operation that invalidates downstream history SHALL do so explicitly through supported replay/repair behavior.

### LIFE-007 — Earlier-result changes must preserve consistency

WHEN an earlier match is replayed or otherwise invalidated,
THEN any dependent downstream result that can no longer be trusted SHALL be cleared, regenerated, blocked, or handled by an explicit repair flow.

The system SHALL NOT leave a bracket or ranking state known to contradict its upstream results.

### LIFE-008 — Early completion

WHEN an in-progress tournament is explicitly completed early,
THEN the current standings MAY determine the champion only when first place is uniquely resolved.

IF first place remains tied,
THEN `champion` SHALL remain unresolved.

### LIFE-009 — Duplication creates a new draft

WHEN a tournament is duplicated,
THEN the duplicate SHALL be a new draft competition rather than a copy of formal match history.

Reusable configuration MAY be copied, while formal rounds/results SHALL be regenerated through the normal lifecycle.

## Compatibility constraints

- Existing tournament JSON SHALL remain readable through normalization.
- Lifecycle changes SHALL NOT require rewriting production D1 records unless an explicit migration is approved.
- Public users SHALL never gain mutation rights through lifecycle transitions.

## Verification anchors

Relevant regression coverage includes lifecycle/domain tests, format tests, action/API tests, staging E2E, and the invariants in `.agents/skills/spin-league-debug/references/invariants.md`.

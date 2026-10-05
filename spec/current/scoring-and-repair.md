# Current Spec: Scoring and Historical Repair

Status: current behavior baseline.

Primary implementation anchors: `src/domain/tournament/matches.js`, `score-validation.js`, `score-correction.js`, format modules, and `worker/services/tournament-actions.js`.

## Formal scoring requirements

### SCORE-001 — Server-authoritative result mutation

WHEN an administrator records, forfeits, replays, corrects, or repairs a formal match,
THEN the mutation SHALL be executed through a server-authoritative tournament action.

The client SHALL NOT be trusted to submit a precomputed replacement bracket or champion for a started tournament.

### SCORE-002 — Valid final score

A completed played match SHALL have non-negative integer scores.

A tied score SHALL NOT be confirmable.

The winning score SHALL be at least 4 points.

### SCORE-003 — Winner consistency

WHEN a match is completed,
THEN `winner` SHALL match the player with the greater score,
AND a completion timestamp SHALL be retained.

### SCORE-004 — Current-round restrictions

Normal score entry SHALL only be accepted for a match that the active format considers currently playable.

The system SHALL reject attempts to use normal score entry to rewrite historical completed rounds.

### SCORE-005 — Administrative outcomes

Forfeit or withdrawal outcomes SHALL retain explicit outcome/reason metadata.

A normal score-correction operation SHALL NOT silently replace an administrative outcome.

### SCORE-006 — Scoring event detail

WHEN structured scoring events/source metadata are supplied by a supported scoring workflow,
THEN the official result MAY retain that detail.

IF a historical score correction makes the stored scoring-event history inconsistent,
THEN the stale event history SHALL be removed or marked invalid rather than presented as authoritative.

## Historical correction requirements

### REPAIR-001 — Analyze before applying

A completed-match score correction SHALL first be classified by impact.

The current model uses:

- Level 0: safe correction;
- Level 1: repairable correction that changes protected standings/state;
- blocked impact: unsupported because the correction can invalidate a bracket/stage that the current repair flow cannot safely reconcile.

### REPAIR-002 — Level 0 correction

WHEN only the score can be changed without altering protected bracket/ranking state,
THEN the system MAY apply the correction directly.

Single-elimination score-number changes are Level 0 only when the winner/bracket path remains unchanged.

### REPAIR-003 — Level 1 repair

WHEN a supported Round Robin or Swiss historical correction changes winner/ranking/state,
THEN the system MAY use the explicit Repair Flow.

A Level 1 repair SHALL require a non-empty reason and SHALL append an auditable repair-history entry.

### REPAIR-004 — Preserve unaffected generated history

A repair SHALL preserve already-generated downstream rounds where the supported repair model explicitly considers those rounds structurally safe.

It SHALL identify downstream completed rounds as locked/preserved context rather than silently regenerating them.

### REPAIR-005 — Unsupported repair cases

The system SHALL block historical corrections that the current repair model cannot reconcile safely.

Current examples include:

- single-elimination corrections that change the advancing winner;
- win-streak corrections that change winner/streak state;
- unsupported Swiss Stage 2 / placement corrections;
- round-robin tie-break winner-changing correction when not supported by the repair flow.

### REPAIR-006 — Repair audit privacy

Repair history is administrative data.

Unauthenticated public tournament representations SHALL NOT expose `repairHistory`.

### REPAIR-007 — Replay is distinct from correction

Replay/reset and score correction are separate operations.

WHEN replaying an earlier completed result can invalidate dependent rounds,
THEN downstream state SHALL be invalidated according to the format rules rather than treated as a harmless score edit.

## Compatibility constraints

- Historical repair SHALL not mutate production data outside an explicit admin action.
- Old tournament versions that do not support score correction SHALL fail safely rather than guessing.
- Formal scoring actions SHALL remain revision-safe under concurrent judges.

## Verification anchors

Relevant coverage includes score validation, replay/correction/repair tests, format tests, action synchronization tests, API tests, and staging E2E.

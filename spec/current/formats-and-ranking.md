# Current Spec: Tournament Formats and Ranking

Status: current behavior baseline.

Primary implementation anchors: `src/formats/`, `src/domain/ranking/`, `src/domain/tournament/standings.js`, and related tests.

## Cross-format requirements

### RANK-001 — Attendance priority

Every checked-in participant SHALL rank above every participant marked `no_show`, even when the checked-in participant has zero wins.

A real loss SHALL NOT cause a checked-in participant to rank below someone who never checked in.

### RANK-002 — Historical results remain attributable

Withdrawal after participation SHALL preserve historical match results.

Ranking/stat derivation SHALL use the applicable historical rounds for that format/stage rather than rewriting old results.

## Single elimination

### FMT-SE-001

Only active winners SHALL advance.

A bye SHALL not be treated as a played match, although the format MAY count the bye in its advancement/stat model.

### FMT-SE-002

When a round is completed and more than one active winner remains,
THEN the next round SHALL be generated from those winners.

WHEN one active winner remains,
THEN that player SHALL become champion.

### FMT-SE-003

Single-elimination standings SHALL prioritize attendance group, champion status, wins, total points, score difference, then deterministic name order.

Historical winner-changing score repair SHALL be blocked unless a dedicated bracket repair flow is introduced.

## Round robin

### FMT-RR-001

Round Robin SHALL support 3–8 active players and schedule each pair once in the standard series.

Odd-player rounds SHALL represent rest/bye without inventing a scored match against a fake player.

### FMT-RR-002

Standard Round Robin ranking SHALL prioritize:

1. attendance group;
2. champion status where applicable;
3. wins;
4. total points scored;
5. deterministic player-name order.

Rows with the same attendance group, wins, and total points SHALL share the same rank.

### FMT-RR-003

WHEN the standard series finishes with multiple players sharing first place,
THEN the tournament SHALL remain unresolved and MAY start a dedicated tie-break series containing only eligible tied first-place players.

Tie-break results SHALL decide that tie group without rewriting the standard series history.

## Swiss

### FMT-SW-001 — Preliminary phase

Swiss V2 SHALL use four preliminary rounds.

Completion of the fourth preliminary round SHALL transition to qualification rather than silently creating a fifth preliminary round.

### FMT-SW-002 — Phase-isolated statistics

Preliminary, qualifier, and final/Stage 2 statistics SHALL be derived from their own applicable rounds.

Historical preliminary rounds SHALL remain stored when the tournament enters qualification or Stage 2.

### FMT-SW-003 — Ranking rule compatibility

New tournaments currently default to `legacy_v1`.

`legacy_v1` ranking SHALL prioritize attendance group, wins, fewer losses, total points, then original order.

Existing tournaments that use `buchholz_v1` SHALL remain compatible. Buchholz ranking uses attendance group, wins, opponent wins, total points, and supported head-to-head resolution for a two-player unresolved tie.

### FMT-SW-004 — Qualification

WHEN the preliminary cut cannot uniquely determine the configured advancing players,
THEN the system MAY create an explicit qualifier series.

Qualifier statistics SHALL use the active qualifier series, not unrelated preliminary/final matches.

### FMT-SW-005 — Stage 2

The configured Stage 2 MAY use supported round-robin, single-elimination, Swiss, or standings-completion behavior according to current tournament configuration.

Already-generated preliminary/qualifier history SHALL remain intact.

### FMT-SW-006 — Final tie resolution

WHEN the configured final stage cannot uniquely resolve required top placement,
THEN the system MAY create explicit tie-break/placement series.

Those series SHALL be represented as separate historical phases.

## Win streak

### FMT-WS-001

Win Streak SHALL support 3–8 active players.

The winner SHALL remain active in the arena, the loser SHALL return to the queue, and the next challenger SHALL be drawn from the queue.

### FMT-WS-002

WHEN a player reaches the configured consecutive-win target,
THEN that player SHALL become champion.

Historical winner-changing repair is currently unsupported and SHALL be blocked.

## Compatibility constraints

- Format modules SHALL remain browser/network independent.
- Ranking behavior changes require a change spec and regression tests.
- Generated rounds SHALL not be silently regenerated after deployment of a new algorithm.

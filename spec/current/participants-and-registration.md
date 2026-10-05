# Current Spec: Participants, Check-in, and Private Registration

Status: current behavior baseline.

Primary implementation anchors: `src/domain/tournament/participant-model.js`, `roster.js`, `registration.js`, `registration-settings.js`, drinks domain, registration views/routes, and related tests.

## Roster requirements

### PART-001 — Formal roster

`players` SHALL represent the full formal tournament roster and SHALL NOT contain duplicate player names.

Participant lifecycle/check-in state SHALL be stored separately in `participantStates`.

Private participant information SHALL be stored separately in `participantDetails`.

### PART-002 — Participant states

Supported participant state semantics include:

- `active`: eligible for future formal pairing;
- `no_show`: never checked in and excluded from pairing;
- `withdrawn`: previously participated or checked in, then left; historical results remain.

### PART-003 — Draft roster editing

Adding, renaming, removing, or editing participant details as a draft operation SHALL only occur while the tournament is `準備中`.

Draft roster mutation SHALL rebuild dependent draft state consistently rather than leaving orphan participant state/details.

### PART-004 — Check-in

Check-in SHALL determine whether a roster participant becomes active when scheduling starts.

A participant who remains unchecked at scheduling start SHALL become `no_show`.

## Private registration requirements

### REG-001 — Product role

The registration link is a private participant-information form for people whose participation has already been confirmed externally.

Spin League SHALL NOT treat this flow as a public ticketing, payment, refund, or accounting system.

### REG-002 — Submission acceptance

WHEN a valid private registration submission is received,
THEN the Worker SHALL validate the latest tournament state and token,
AND the participant SHALL be added directly to the formal draft roster without a second approval step.

### REG-003 — Capacity and uniqueness

A submission SHALL be rejected when the configured tournament capacity is full.

A submission SHALL be rejected when the player name already exists in the formal roster.

A submission SHALL be rejected when the normalized participant phone duplicates another participant in the tournament.

### REG-004 — Contact details

A private registration submission SHALL include a valid contact phone according to current normalization/validation rules.

Notes/custom answers MAY be stored as private participant details subject to validation and size constraints.

### REG-005 — Drink selection

Drink data belongs to `participantDetails`, not attendance state.

WHEN drink selection is enabled or supplied,
THEN the submitted selection SHALL resolve against the tournament's current drink settings.

Historical display data SHALL remain readable even if later menu configuration changes.

### REG-006 — Registration settings are draft settings

Registration settings SHALL only be modified while the tournament is `準備中`.

WHEN private registration is disabled,
THEN the previous token SHALL be revoked/rotated so the old URL is no longer valid.

WHEN scheduling begins,
THEN registration SHALL be revoked/closed.

### REG-007 — Old registration compatibility

Legacy registration-table workflows MAY remain for compatibility, but the current private participant-information flow SHALL not require a pending/approved/rejected approval cycle before adding the player to the formal roster.

## Compatibility constraints

- Existing tournaments without participant details or drink data SHALL remain readable through normalization.
- Registration changes SHALL preserve current tournament JSON compatibility unless an explicit migration is approved.
- Phone, notes, answers, drinks, and registration tokens are private/admin data.

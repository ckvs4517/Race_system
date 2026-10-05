# Current Spec: Privacy and Administrative Authorization

Status: current behavior baseline.

Primary implementation anchors: `src/domain/tournament/visibility.js`, `src/data/store.js`, Worker auth/routes/services, API/privacy tests, and deployment smoke tests.

## Requirements

### PRIV-001 — Public tournament projection

Unauthenticated tournament responses SHALL use a public-safe representation.

The public representation SHALL NOT expose:

- `participantDetails`;
- `registrationSettings.token`;
- `repairHistory`.

Public schedule, roster names, scores, standings, event information, and safe registration settings MAY remain visible.

### PRIV-002 — Admin representation

A valid administrative session MAY receive the complete tournament representation required for tournament management.

Administrative mutation endpoints SHALL require valid authorization.

### PRIV-003 — Login transition

WHEN admin login succeeds,
THEN the client SHALL clear incompatible public tournament cache validators and reload full tournament data.

A cached public response SHALL NOT prevent the authenticated client from receiving private admin fields.

### PRIV-004 — Logout transition

WHEN the administrator logs out,
THEN private participant data and private registration tokens SHALL be removed from in-memory browser state immediately.

The client SHALL NOT keep private tournament objects accessible merely because they were fetched earlier in the session.

### PRIV-005 — ETag separation

Public and authenticated/admin tournament representations SHALL NOT share ETag behavior in a way that can return a public `304 Not Modified` for an authenticated request expecting private data.

### PRIV-006 — Public pages are read-only

Public tournament pages SHALL NOT perform formal tournament mutations.

The standalone scoreboard SHALL NOT mutate formal tournament data.

### PRIV-007 — User-controlled HTML

User-controlled tournament/participant/registration text inserted into HTML string templates SHALL be escaped for the appropriate context.

### PRIV-008 — Secrets and personal data

Real admin PINs, session tokens, registration tokens, participant phone numbers, private notes/answers, or production backups SHALL NOT be committed to the repository.

## Known limitations

The current system still uses a shared organizer/admin PIN and does not yet provide individual judge accounts/audit identity or platform-level rate limiting for all relevant endpoints.

These are explicit risks, not permission to weaken the existing privacy boundary.

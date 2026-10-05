# Change Spec: <title>

Related issue: #<number>
Status: proposed | accepted | implemented | archived

## Goal

Describe the user/system outcome in a few sentences.

## Non-goals

- Explicitly list adjacent behavior that is not part of this change.

## Current behavior

Describe only the existing behavior needed to understand the change. Link to the relevant `spec/current/*.md` files.

## Requirements

Use stable IDs.

### CHG-001

WHEN <condition>
THEN the system SHALL <observable behavior>.

### CHG-002

IF <condition>
THEN the system SHALL <observable behavior>.

## Design constraints

Only record constraints that matter to safe implementation, for example:

- owning domain/feature layer;
- server-authoritative action requirement;
- public/admin privacy boundary;
- revision/ETag behavior;
- backwards compatibility;
- no production data migration.

Do not turn this section into a line-by-line coding plan.

## Data / compatibility impact

- Existing tournament JSON:
- D1/schema migration:
- Old backups:
- Public API:
- Admin API:

## Acceptance criteria

- [ ] CHG-001 is covered by an automated regression test.
- [ ] CHG-002 is covered by an automated regression test.
- [ ] Relevant architecture checks pass.
- [ ] Relevant focused tests pass.
- [ ] Full/browser/staging gates are completed when required.
- [ ] No production deployment occurs without explicit approval.

## Current-spec update

After acceptance, list which `spec/current/*.md` requirements must be added, changed, or retired.

## Remaining risks

Record known behavior not covered by this change.

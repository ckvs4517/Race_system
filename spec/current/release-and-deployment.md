# Current Spec: Release and Deployment Safety

Status: current behavior baseline.

Normative operational source: `RELEASE_CONTRACT.md`.

This spec summarizes release behavior for feature/change specifications. If this summary conflicts with `RELEASE_CONTRACT.md`, the release contract SHALL take precedence until the documents are reconciled.

## Targets

- Local: isolated local preview/test environment.
- Staging: existing `spin-league-test` Site with separate Test D1.
- Production: existing `spin-league-tournament` Site with Production D1.

## Requirements

### REL-001 — Environment identity

Staging and Production SHALL remain separate Sites with separate D1 databases.

A release SHALL NOT substitute the staging database for production or the production database for staging.

### REL-002 — Exact SHA

A release candidate SHALL lock an exact Git SHA.

Local verification, staging deployment/verification, staging E2E, and any approved production deployment SHALL refer to that same source revision.

A source-SHA mismatch SHALL fail the release gate.

### REL-003 — Required release order

The release sequence SHALL be:

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

A failed earlier gate SHALL block later gates.

### REL-004 — Staging destructive test boundary

Destructive browser E2E SHALL only target `spin-league-test` and Test D1.

The workflow SHALL be hard-locked against production targets and SHALL preserve unrelated pre-existing staging data.

### REL-005 — Production write approval

Production publication SHALL require explicit operator approval according to the active release mode.

Passing CI or staging tests alone SHALL NOT authorize an unapproved production write.

### REL-006 — Production preservation

Normal production deployment SHALL:

- update only the existing production Site/version for the approved SHA;
- preserve the existing production Site identity;
- preserve production D1 and tournament data;
- preserve the repository's configured hosting identity;
- never create a replacement production Site or D1;
- never run destructive production E2E;
- never automatically rollback through another unapproved production write.

### REL-007 — Production baseline and verification

Immediately before a production deployment, the release flow SHALL capture a read-only baseline including live source identity and tournament identity/count information.

After deployment, production verification SHALL be read-only and SHALL confirm site/API readability, source SHA, data preservation, and smoke/privacy checks.

### REL-008 — Failure handling

A failed gate SHALL stop subsequent release stages.

IF a production write may already have started,
THEN the system SHALL fail safely and require operator inspection rather than automatically retrying or rolling back.

## Development implication

A feature spec MAY require local/full tests and staging E2E as acceptance gates, but SHALL NOT itself grant permission to deploy production.

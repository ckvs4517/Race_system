# Spin League Release Contract

This document defines the release safety contract for `ckvs4517/Race_system` when releases are orchestrated by `ckvs4517/Spin-league_Server_Manager`.

## Targets

- Local: Manager-owned checkout and preview only.
- Staging: existing Site `spin-league-test` with the staging/Test D1.
- Production: existing Site `spin-league-tournament` with the production D1.

Staging and Production are different Sites and different D1 databases. A release must never replace, reset, restore, migrate, or otherwise substitute the Production D1 as part of normal deployment.

## Exact-SHA invariant

A release locks one repository, branch, and exact 40-character Git SHA at `Start Release`.

The same exact SHA must be used for:

1. Local deploy.
2. Local release tests and Local Release E2E.
3. Staging deploy.
4. Staging live SHA verification.
5. Staging browser E2E.
6. Production deploy, if approved.
7. Production live SHA verification.

A SHA mismatch at any gate fails the release and blocks later stages.

## Required order

The release order is:

`Local deploy/tests/E2E → Staging deploy → Staging SHA verify → Staging E2E → Production approval → Production deploy → Production SHA verify → read-only Production smoke/data-integrity verification`.

Production must never be promoted before every Local and Staging gate has passed.

## Staging destructive E2E boundary

Destructive browser E2E is permitted only against `spin-league-test` and its TEST-D1 test data.

The staging E2E target lock is authoritative. A destructive E2E must never accept or derive a Production target. Test records must be identifiable as E2E data and cleaned up, while pre-existing staging data must remain intact.

## Production approval modes

The Manager supports two explicit approval modes.

### Auto Promote OFF

The pipeline stops at `PRODUCTION_DEPLOY` after all Staging gates pass. The operator must separately prepare the read-only Production baseline and explicitly confirm the Production deployment.

### Auto Promote ON

Selecting `Auto promote to Production` and then confirming `Start Release` is the operator's explicit approval for the locked exact SHA to be deployed automatically to Production **only after every Local and Staging gate passes**.

No second approval is required after Staging passes. If any earlier gate fails, Production must not be touched.

Auto Promote does not weaken any Production safety guard. The exact-SHA guard, Production identity guard, baseline capture, data-preservation checks, and read-only smoke verification remain mandatory.

## Production deployment safety

Production deployment may update only the existing `spin-league-tournament` Site/version/deployment for the locked exact SHA.

The release flow must:

- preserve the existing Production Site;
- preserve the existing Production D1 and tournament data;
- use the repository's existing `.openai/hosting.json` identity;
- never create a new Production Site or D1;
- never reset, restore, or replace Production data;
- never run destructive Production E2E;
- never perform an automatic Production rollback.

A rollback is another Production write and therefore always requires separate operator judgment and approval.

## Production baseline and verification

Immediately before a Production write, the Manager must capture a read-only baseline that includes at least:

- Production API readability;
- current live source SHA;
- existing tournament IDs and count.

After deployment, verification is read-only and must confirm:

- Production website is reachable;
- Production API is readable;
- live source marker equals the locked exact SHA;
- every pre-deploy tournament ID remains readable;
- the Production smoke/privacy checks pass.

No destructive write test is permitted as part of Production verification.

## Failure behavior

Any failed gate stops later stages.

If failure occurs before a Production write, Production remains untouched.

If a Production write may already have started, the release is failed and must not automatically retry or rollback. The operator must inspect the persisted release log, live SHA, and Production data baseline before deciding the next action.

## Release history

The Manager is the operational source for release execution history. Each release record should retain the locked branch/SHA, Auto Promote intent, stage results, timestamps/duration, failure stage/reason, Production write intent, and persisted logs.

This contract is intentionally stricter than a generic CI/CD pipeline because Production tournament data is stateful and must survive application releases unchanged.

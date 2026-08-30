---
name: spin-league-deploy
description: Build, stage, review, and safely update the existing Spin League ChatGPT Site without replacing production D1 data.
---

# Deployment workflow

1. Confirm deployment was explicitly requested. Tests passing is not deployment approval.
2. Read `references/sites-checklist.md` and `ARCHITECTURE.md`.
3. Inspect the target Git SHA and diff; ensure no secrets, phone data, or production backups are committed.
4. Run `npm run health` and `node scripts/test-full.mjs --browser=required` when Chrome is available.
5. Run `node scripts/build-site.mjs`; confirm the artifact carries the real `GIT <sha>` marker and its deployed `app.css` is flattened.
6. Confirm `.openai/hosting.json` still points to the existing production project/D1 identity. Never rewrite it for staging.
7. For a release candidate, deploy the exact target SHA to the existing permanent staging Site `spin-league-test`, which must use the separate Test D1.
8. Confirm the staging footer shows that exact Git revision.
9. Manually dispatch GitHub Actions `Staging E2E` with `expected_sha` equal to the exact deployed staging SHA. A run without an exact expected SHA is not release acceptance.
10. Do not proceed to production if staging E2E fails, the live marker differs, or public APIs expose `participantDetails` / `registrationSettings.token`.
11. Production: update the existing `spin-league-tournament` Site only; do not create a replacement Site or D1 database.
12. Do not run backup restore, reset, or D1 migration unless the change explicitly requires it and has separate approval/backups.
13. Review the generated production preview before publication when available.
14. After publication, run `node scripts/verify-deployment.mjs <production-site-url>`. This smoke check includes public tournament privacy assertions.
15. Verify at least one pre-existing tournament remains readable and production data count/content is intact before entering new scores.

Report the source SHA, staging E2E run, production action taken, and post-publish data verification. Never imply production was updated if only staging/CI was tested.

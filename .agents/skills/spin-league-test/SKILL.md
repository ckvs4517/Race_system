---
name: spin-league-test
description: Select and run compact, deterministic Spin League tests for a code change.
---

# Test workflow

1. Read `references/test-matrix.md`.
2. Run only the smallest owning tests while editing.
3. Run `node scripts/test-fast.mjs` when the focused fix passes.
4. Run `node scripts/test-full.mjs` before deployment or after cross-layer changes.
5. Browser tests are skipped by default; use `--browser=required` when the local Chrome environment is known to work and the change affects rendering, events, navigation, or end-to-end management flow.
6. Use `--browser=skip` only when a browser is unavailable and state that browser coverage was skipped.
7. After updating the long-lived staging Site, run the GitHub Actions workflow `Staging E2E` against `spin-league-test`. The workflow performs real UI writes only to the TEST D1, cleans up its own `[E2E]` tournament, and requires the `STAGING_ADMIN_PIN` repository Actions secret.
8. Never repoint the staging E2E runner at production. `scripts/lib/staging-target.mjs` must continue to hard-reject any host other than `spin-league-test.ckvs4517.chatgpt.site`.
9. On failure, report the first failing command and its captured output; do not flood the context with successful logs. For live staging failures, inspect the uploaded `staging-e2e-report.json` and optional failure screenshot.

# Commands

```bash
node scripts/test-fast.mjs
node scripts/test-full.mjs
node scripts/test-full.mjs --browser=required
node scripts/test-full.mjs --browser=skip --skip-build
STAGING_ADMIN_PIN=<secret> EXPECTED_GIT_SHA=<deployed-sha> node scripts/verify-staging-e2e.mjs https://spin-league-test.ckvs4517.chatgpt.site/
```

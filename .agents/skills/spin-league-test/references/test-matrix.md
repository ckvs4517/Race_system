# Source-to-test matrix

| Changed area | Minimum focused tests |
| --- | --- |
| `src/formats/swiss.js` or Swiss ranking | `tests/swiss.test.mjs`, `tests/swiss-ranking.test.mjs`, `tests/format-matrix.test.mjs`, `tests/check-in.test.mjs` |
| `src/formats/single-elimination.js` | `tests/format-matrix.test.mjs`, browser `tournament.test.html` |
| `src/formats/round-robin.js`, `src/formats/win-streak.js` | `tests/small-formats.test.mjs`, `tests/format-matrix.test.mjs` |
| `src/domain/tournament.js` or `src/domain/tournament/**` | `tests/v2-domain-boundary.test.mjs`, `tests/check-in.test.mjs`, `tests/swiss.test.mjs`, `tests/format-matrix.test.mjs`, browser tournament test |
| `src/domain/tournament/visibility.js` | `tests/v2-domain-boundary.test.mjs`, `tests/registration.test.mjs`, `tests/admin-privacy-transition.test.mjs` |
| `src/data/store.js` | `tests/sync.test.mjs`, `tests/action-sync.test.mjs`; add `tests/admin-privacy-transition.test.mjs` for auth/visibility changes |
| `src/data/spinlab.js` or `src/views/speedometer.js` | `tests/spinlab.test.mjs`, `tests/screen-wake-lock.test.mjs`, `tests/speed-report.test.mjs` |
| `src/features/schedule/**` | `tests/check-in.test.mjs`, `tests/quick-score.test.mjs`, `tests/stage2-rounds-visibility.test.mjs`, browser flows as relevant |
| `worker/routes/**`, `worker/services/**` | `tests/v2-worker-boundary.test.mjs`, `tests/api.test.mjs`, `tests/action-sync.test.mjs`; add registration/privacy tests when relevant |
| `worker/db/**` | `tests/v2-worker-boundary.test.mjs`, `tests/api.test.mjs`, `tests/registration.test.mjs`, Sites build |
| Registration views/routes | `tests/registration.test.mjs`, `tests/admin-privacy-transition.test.mjs`, `tests/html-escaping.test.mjs`, `tests/check-in.test.mjs` |
| `src/views/schedule.js` or `src/views/schedule/**` | `tests/v2-schedule-boundary.test.mjs`, `tests/tournament-list.test.mjs`, `tests/check-in.test.mjs`, `tests/swiss.test.mjs`, `tests/early-finish-lock.test.mjs`, `tests/html-escaping.test.mjs`, browser flows |
| `src/views/manage.js` | `tests/event-info.test.mjs`, `tests/html-escaping.test.mjs`, browser full flow |
| `src/views/data-management.js` | `tests/data-management.test.mjs`, `node scripts/validate-backup.mjs <file>` |
| `src/core/router.js` or navigation | `tests/navigation.test.mjs`, browser full flow |
| `src/core/roster-filter.js` | `tests/roster-filter.test.mjs`, `tests/check-in.test.mjs` |
| `src/styles/app.css` or Phase 5 modules | `tests/v2-css-boundary.test.mjs`, `tests/responsive-ui.test.mjs`, browser flows, Sites build |
| `scripts/build-site.mjs` | `tests/source-version.test.mjs`, `node scripts/build-site.mjs`, full CI/build artifact validation |
| `scripts/lib/source-version.mjs` or deployed version marker | `tests/source-version.test.mjs`, `node scripts/build-site.mjs` |
| `scripts/verify-staging-*.mjs`, staging guard/workflow | `tests/staging-target.test.mjs`; then dispatch `Staging E2E` against `spin-league-test` with exact deployed `expected_sha` |
| Public API/privacy boundary | `tests/registration.test.mjs`, `tests/admin-privacy-transition.test.mjs`, `scripts/verify-deployment.mjs` after deployment |

`test-fast.mjs` covers common domain, API, sync, privacy, HTML escaping, backup, registration, responsive, V2 architecture boundaries, deployed source-version, and staging safety regressions. `test-full.mjs` discovers all Node `.test.mjs` files, optionally executes both browser test pages, and builds the Sites artifact.

The live `Staging E2E` workflow is intentionally separate from ordinary CI because it performs real writes against the TEST D1. It is hard-locked to `spin-league-test.ckvs4517.chatgpt.site`, creates only uniquely named `[E2E]` tournaments, removes its own records in cleanup, and verifies pre-existing Test D1 tournament IDs remain present. It requires `STAGING_ADMIN_PIN` and an exact `expected_sha`; never place the PIN in source, workflow inputs, logs, or test artifacts.

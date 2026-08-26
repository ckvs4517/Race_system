# Source-to-test matrix

| Changed area | Minimum focused tests |
| --- | --- |
| `src/formats/swiss.js` | `tests/swiss.test.mjs`, `tests/format-matrix.test.mjs`, `tests/check-in.test.mjs` |
| `src/formats/single-elimination.js` | `tests/format-matrix.test.mjs`, browser `tournament.test.html` |
| `src/domain/tournament.js` | `tests/check-in.test.mjs`, `tests/swiss.test.mjs`, `tests/format-matrix.test.mjs`, browser tournament test |
| `src/data/store.js` | `tests/sync.test.mjs`, `tests/action-sync.test.mjs` |
| `src/data/spinlab.js` or `src/views/speedometer.js` | `tests/spinlab.test.mjs`, `tests/screen-wake-lock.test.mjs`, `tests/speed-report.test.mjs` |
| `worker/index.js` | `tests/api.test.mjs`, `tests/action-sync.test.mjs`; add registration test when relevant |
| Registration views/routes | `tests/registration.test.mjs`, `tests/check-in.test.mjs` |
| `src/views/schedule.js` or `src/views/schedule/**` | `tests/v2-schedule-boundary.test.mjs`, `tests/tournament-list.test.mjs`, `tests/check-in.test.mjs`, `tests/swiss.test.mjs`, `tests/early-finish-lock.test.mjs`, browser flows |
| `src/views/manage.js` | `tests/event-info.test.mjs`, browser full flow |
| `src/views/data-management.js` | `tests/data-management.test.mjs`, `node scripts/validate-backup.mjs <file>` |
| `src/core/router.js` or navigation | `tests/navigation.test.mjs`, browser full flow |
| `src/core/roster-filter.js` | `tests/roster-filter.test.mjs`, `tests/check-in.test.mjs` |
| `src/styles/app.css` | `tests/responsive-ui.test.mjs`, browser flows, manual mobile viewport |
| `scripts/lib/source-version.mjs` or deployment version marker | `tests/source-version.test.mjs`, `node scripts/build-site.mjs` |
| `scripts/verify-staging-e2e.mjs`, staging target guard, or Staging E2E workflow | `tests/staging-target.test.mjs`; then manually dispatch `Staging E2E` against `spin-league-test` after deployment |
| Build/deployment scripts | `tests/source-version.test.mjs`, `tests/staging-target.test.mjs`, `node scripts/build-site.mjs`, `node scripts/test-full.mjs --browser=skip` |

`test-fast.mjs` covers common domain, API, sync, backup, registration, responsive, V2 architecture boundary, deployed source-version, and staging-target safety regressions. `test-full.mjs` discovers all Node `.mjs` tests, optionally executes both browser test pages, and builds the Sites artifact.

The live `Staging E2E` workflow is intentionally separate from ordinary CI because it performs real writes against the TEST D1. It is hard-locked to `spin-league-test.ckvs4517.chatgpt.site`, creates only uniquely named `[E2E]` tournaments, removes its own records in cleanup, and verifies pre-existing Test D1 tournament IDs remain present. It requires the repository Actions secret `STAGING_ADMIN_PIN`; never place the PIN in source, workflow inputs, logs, or test artifacts.

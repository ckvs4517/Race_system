# Architecture map

| Concern | Primary files | Verification |
| --- | --- | --- |
| App bootstrap/routing coordination | `src/main.js`, `src/core/router.js` | `tests/v2-main-boundary.test.mjs`, `tests/navigation.test.mjs`, browser flows |
| Feature interactions | `src/features/*` | feature/domain regressions, browser flows |
| Public/admin rendering | `src/views/*`, `src/ui/*` | view-specific tests, `tests/html-escaping.test.mjs`, `tests/responsive-ui.test.mjs` |
| Schedule rendering | `src/views/schedule.js` facade, `src/views/schedule/*` | `tests/v2-schedule-boundary.test.mjs`, schedule/tournament regressions |
| Client API, auth representation, ETag/revision sync | `src/data/store.js` | `tests/admin-privacy-transition.test.mjs`, `tests/sync.test.mjs`, `tests/action-sync.test.mjs` |
| Shared tournament domain | `src/domain/tournament.js` facade, `src/domain/tournament/*` | `tests/v2-domain-boundary.test.mjs`, tournament regressions |
| Public tournament privacy projection | `src/domain/tournament/visibility.js`, `worker/routes/api.js` | `tests/v2-domain-boundary.test.mjs`, `tests/registration.test.mjs`, deployment smoke |
| Single elimination | `src/formats/single-elimination.js` | browser tournament test, format matrix |
| Swiss / Stage 2 | `src/formats/swiss.js`, ranking domain, tournament Stage 2 actions | `tests/swiss.test.mjs`, `tests/swiss-ranking.test.mjs`, format matrix |
| Small formats | `src/formats/round-robin.js`, `src/formats/win-streak.js` | `tests/small-formats.test.mjs`, format matrix |
| Registration | `src/features/registration/*`, `src/views/registration*.js`, `worker/routes/api.js`, `worker/services/registration-validation.js` | `tests/registration.test.mjs`, `tests/admin-privacy-transition.test.mjs` |
| Backup/CSV | `src/views/data-management.js`, related export/domain files | `tests/data-management.test.mjs`, backup validator |
| Worker API routing/security | `worker/index.js`, `worker/routes/*`, `worker/services/*` | `tests/v2-worker-boundary.test.mjs`, `tests/api.test.mjs`, registration/action sync tests |
| Worker D1 persistence | `worker/db/*` | `tests/v2-worker-boundary.test.mjs`, API/registration tests, Sites build |
| Styles source ownership | `src/styles/app.css`, `src/styles/base/*`, `src/styles/features/*`, `src/styles/responsive/*` | `tests/v2-css-boundary.test.mjs`, responsive/browser tests |
| Sites style packaging | `scripts/build-site.mjs` | full test/build; deployed `app.css` must contain no `@import` |
| D1 schema | `db/schema.ts`, `.openai/drizzle/*.sql` | API tests, Sites build |
| Sites packaging/source marker | `scripts/build-site.mjs`, `scripts/lib/source-version.mjs`, `.openai/hosting.json` | source-version tests, Sites build |
| Staging release gate | `.github/workflows/staging-e2e.yml`, `scripts/verify-staging-browser-e2e.mjs`, `scripts/lib/staging-target.mjs` | `tests/staging-target.test.mjs`, live Staging E2E with exact `expected_sha` |

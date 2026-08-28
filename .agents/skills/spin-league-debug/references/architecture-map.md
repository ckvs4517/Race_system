# Architecture map

| Concern | Primary files | Verification |
| --- | --- | --- |
| Routing/navigation | `src/core/router.js`, `src/main.js` | `tests/navigation.test.mjs`, browser flows |
| Public/admin rendering | `src/views/*`, `src/ui/*`, `src/styles/app.css` | view-specific tests, `tests/responsive-ui.test.mjs` |
| Client API and sync | `src/data/store.js` | `tests/sync.test.mjs`, `tests/action-sync.test.mjs` |
| Shared tournament domain | `src/domain/tournament.js` facade, `src/domain/tournament/*` | `tests/v2-domain-boundary.test.mjs`, tournament regressions |
| Single elimination | `src/formats/single-elimination.js` | browser tournament test, format matrix |
| Swiss | `src/formats/swiss.js` | `tests/swiss.test.mjs`, format matrix |
| Registration | `src/views/registration*.js`, `worker/routes/api.js`, `worker/services/registration-validation.js`, `worker/db/registrations.js` | `tests/registration.test.mjs` |
| Backup/CSV | `src/views/data-management.js` | `tests/data-management.test.mjs`, backup validator |
| Worker API routing/security | `worker/index.js`, `worker/routes/*`, `worker/services/*` | `tests/v2-worker-boundary.test.mjs`, `tests/api.test.mjs`, registration/action sync tests |
| Worker D1 persistence | `worker/db/*` | `tests/v2-worker-boundary.test.mjs`, API/registration tests, Sites build |
| D1 schema | `db/schema.ts`, `.openai/drizzle/*.sql` | API tests, Sites build |
| Sites packaging | `scripts/build-site.mjs`, `.openai/hosting.json` | `node scripts/build-site.mjs` |

# Architecture map

| Concern | Primary files | Verification |
| --- | --- | --- |
| Routing/navigation | `src/core/router.js`, `src/main.js` | `tests/navigation.test.mjs`, browser flows |
| Public/admin rendering | `src/views/*`, `src/ui/*`, `src/styles/app.css` | view-specific tests, `tests/responsive-ui.test.mjs` |
| Client API and sync | `src/data/store.js` | `tests/sync.test.mjs`, `tests/action-sync.test.mjs` |
| Shared lifecycle | `src/domain/tournament.js` | `tests/check-in.test.mjs`, `tests/tournament.test.js` |
| Single elimination | `src/formats/single-elimination.js` | browser tournament test, format matrix |
| Swiss | `src/formats/swiss.js` | `tests/swiss.test.mjs`, format matrix |
| Registration | `src/views/registration*.js`, Worker registration routes | `tests/registration.test.mjs` |
| Backup/CSV | `src/views/data-management.js` | `tests/data-management.test.mjs`, backup validator |
| Worker/API/security | `worker/index.js` | `tests/api.test.mjs`, registration/action sync tests |
| D1 schema | `db/schema.ts`, `.openai/drizzle/*.sql` | API tests, Sites build |
| Sites packaging | `scripts/build-site.mjs`, `.openai/hosting.json` | `node scripts/build-site.mjs` |

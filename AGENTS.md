# Spin League Agent Instructions

## Purpose

This repository is a production tournament system. Make the smallest change that fixes the requested behavior, preserve existing tournament data, and verify the relevant user flow before proposing deployment.

Spin League V2 architecture phases 0–5 are complete. Treat the current module boundaries as the supported architecture, not as a temporary migration target. Read `ARCHITECTURE.md` before architecture/refactor work.

## Current project shape

- Frontend: browser-native HTML, CSS, and JavaScript ES Modules. No React/Vue/bundler runtime.
- Router: URL hash routes in `src/core/router.js`.
- App coordination: `src/main.js` is a thin coordinator.
- User-facing interactions: `src/features/<feature>/`.
- Views: string-rendered HTML in `src/views/`; schedule rendering is split under `src/views/schedule/`.
- State/API client: `src/data/store.js`; it owns browser API calls, revision/ETag handling, and admin/public representation changes.
- Shared tournament rules: stable facade `src/domain/tournament.js`, implementations under `src/domain/tournament/`.
- Format-specific rules: `src/formats/`.
- Reusable UI: `src/ui/`.
- Styles: `src/styles/app.css` is an ordered source manifest over `src/styles/base/`, `src/styles/features/`, and `src/styles/responsive/`. The Sites build flattens the manifest into one deployed stylesheet.
- Backend entry: thin `worker/index.js`.
- Backend routing/services/persistence: `worker/routes/`, `worker/services/`, `worker/db/`.
- Worker/shared-domain bridge: `worker/tournament-domain.js`.
- Database: Cloudflare D1; schema and migrations live in `db/` and `.openai/drizzle/`.
- Deployment: existing ChatGPT Sites project described by `.openai/hosting.json`.
- Tests: zero-dependency Node and headless-browser tests in `tests/`, plus a destructive staging-only E2E locked to the Test D1.

## Architecture rules

These rules are requirements, not suggestions.

1. Before adding code, identify the owning feature/layer.
2. Do not add feature-specific behavior back to `src/main.js`.
3. Do not add schedule implementation back to `src/views/schedule.js`; use the owning `src/views/schedule/` module.
4. Do not add tournament implementation back to `src/domain/tournament.js`; preserve the facade and use a coherent module under `src/domain/tournament/`.
5. `src/domain/` and `src/formats/` must remain independent of DOM/browser state and network access.
6. Domain/format code must not import views, UI, features, data/API clients, app coordination, services, or export presentation code.
7. User-facing interaction logic belongs in `src/features/<feature>/`; views should not become controllers.
8. Browser API communication remains centralized through `src/data/store.js` until a deliberately reviewed service split; do not introduce ad-hoc `fetch()` calls in features/views.
9. Worker request coordination belongs in `worker/routes/`, authorization/server validation/action dispatch in `worker/services/`, and D1 statements only in `worker/db/`.
10. Source CSS ownership belongs in the Phase 5 style modules. Keep `src/styles/app.css` as an ordered manifest and do not add nested imports.
11. Do not create generic dumping-ground modules named `utils.js`, `helpers.js`, `common.js`, `misc.js`, or `shared.js`.
12. If a change does not fit the architecture cleanly, improve the boundary rather than adding a special case to a hotspot.
13. Refactor-only work must not change tournament JSON semantics, D1 data, API behavior, ranking/pairing results, or user-visible behavior unless the change is separately identified and tested.

Before committing architecture/refactor work, run:

```bash
npm run check:architecture
```

Do not weaken architecture checks or raise size baselines merely to make a change pass.

## Read the matching workflow before editing

- Tournament bugs, ranking, pairing, scoring, state transitions: `.agents/skills/spin-league-debug/SKILL.md`
- Test selection and verification: `.agents/skills/spin-league-test/SKILL.md`
- Sites build or deployment: `.agents/skills/spin-league-deploy/SKILL.md`
- Backup inspection or repair: `.agents/skills/spin-league-backup/SKILL.md`

For a concise task-specific file map, run:

```bash
node scripts/agent-context.mjs "task keywords"
```

## Critical invariants

- A checked-in participant always ranks above a `no_show` participant.
- A participant with real losses still ranks above someone who never checked in.
- Swiss preliminary, qualifier, and Stage 2 statistics are phase-specific; historical matches remain stored.
- Existing generated rounds must not be silently regenerated after a code update.
- Replaying an earlier completed match may invalidate later rounds and results.
- A tied score cannot be confirmed; the winner must have at least 4 points.
- Public pages are read-only. Formal changes require a valid admin session.
- The standalone scoreboard never modifies formal tournament data.
- Worker actions must validate and derive official results on the server.
- Revision checks and conflict responses must remain intact.
- Unauthenticated `GET /api/tournaments` and `GET /api/tournaments/:id` must never expose `participantDetails` or `registrationSettings.token`.
- Admin/public tournament representations must not share an ETag in a way that can return a public 304 to an authenticated request.
- Logging out must remove private participant fields and registration tokens from in-memory browser state.

Detailed tournament rules: `.agents/skills/spin-league-debug/references/invariants.md`.

## Production and staging safety

- Production Site: existing `spin-league-tournament` project. Never create a replacement project during an update.
- Permanent staging Site: `spin-league-test`; it must use a separate Test D1.
- Never modify production D1 data without explicit approval and a fresh backup.
- Never bind staging or automated write tests to production D1.
- Never delete or replace `.openai/hosting.json` or change its existing project/D1 identity unless explicitly requested.
- Backup repair tools must write a new file and preserve the original.
- Never commit real PINs, tokens, secrets, phone numbers, or production backups.
- Do not deploy merely because tests passed; deployment requires explicit approval.
- Production publication requires preview/verification and a post-publish check that existing tournament data is still readable.

The GitHub Actions `Staging E2E` workflow is a release gate. It must stay hard-locked to `spin-league-test`, use `STAGING_ADMIN_PIN` from repository secrets, and require `expected_sha` matching the exact deployed staging source revision.

## Change discipline

1. Reproduce or identify the failing rule before editing.
2. Locate the owning layer: app, feature/view, store, domain, format, Worker route/service/db, schema, or build/deploy.
3. Prefer fixing derived calculations over rewriting stored production data.
4. Add or update a regression test for behavior/security changes.
5. Do not introduce a framework or new runtime dependency unless explicitly requested.
6. Do not refactor unrelated code in the same behavior change.
7. Keep comments focused on why a business rule exists; Traditional Chinese comments are acceptable.
8. Escape all user-controlled data inserted into HTML string templates.
9. Treat participant phone numbers, notes, custom answers, private registration tokens, backups, and admin tokens as private data.

## Verification

- Architecture: `npm run check:architecture`
- Repository/architecture health: `npm run health`
- Focused/common regressions: `node scripts/test-fast.mjs`
- Full Node/build checks: `node scripts/test-full.mjs`
- Full browser-required checks: `node scripts/test-full.mjs --browser=required`
- Validate a backup: `node scripts/validate-backup.mjs path/to/backup.json`
- Local isolated preview: `node scripts/preview-local.mjs`
- Sites artifact: `node scripts/build-site.mjs`
- Deployment smoke: `node scripts/verify-deployment.mjs https://...`
- After staging deploy: manually dispatch `Staging E2E` with the exact deployed Git SHA.

Report:

- files changed;
- root cause and behavior changed;
- tests run and result;
- data migration/compatibility impact;
- remaining risks;
- whether staging or production deployment was performed.

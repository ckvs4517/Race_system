# Spin League Agent Instructions

## Purpose

This repository is a production tournament system. Make the smallest change that fixes the requested behavior, preserve existing tournament data, and verify the relevant user flow before proposing deployment.

## Project shape

- Frontend: browser-native HTML, CSS, and JavaScript ES Modules.
- Router: URL hash routes in `src/core/router.js`.
- UI: string-rendered views in `src/views/`, coordinated by `src/main.js`.
- State/API client: `src/data/store.js`.
- Shared tournament rules: `src/domain/tournament.js`.
- Format-specific rules: `src/formats/`.
- Backend: `worker/index.js`.
- Database: Cloudflare D1; schema and migrations live in `db/` and `.openai/drizzle/`.
- Deployment: existing ChatGPT Sites project described by `.openai/hosting.json`.
- Tests: zero-dependency Node and headless-browser tests in `tests/`.

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
- Swiss preliminary, qualifier, and final statistics are phase-specific; historical matches remain stored.
- Existing generated rounds must not be silently regenerated after a code update.
- Replaying an earlier completed match may invalidate later rounds and results.
- A tied score cannot be confirmed; the winner must have at least 4 points.
- Public pages are read-only. Formal changes require a valid admin session.
- The standalone scoreboard never modifies formal tournament data.
- Worker actions must validate and derive official results on the server.
- Revision checks and conflict responses must remain intact.

Detailed rules: `.agents/skills/spin-league-debug/references/invariants.md`.

## Change discipline

1. Reproduce or identify the failing rule before editing.
2. Locate the owning layer: view, store, domain, format, Worker, D1, or build/deploy.
3. Prefer fixing derived calculations over rewriting stored production data.
4. Add or update a regression test for behavior changes.
5. Do not introduce React, Vue, a bundler, runtime dependencies, or a new framework unless explicitly requested.
6. Do not refactor unrelated code in the same change.
7. Keep comments focused on why a business rule exists; Traditional Chinese comments are acceptable.

## Safety

- Never modify production D1 data without explicit approval and a fresh backup.
- Backup repair tools must write a new file and preserve the original.
- Never commit real PINs, tokens, secrets, phone numbers, or production backups.
- Never delete or replace `.openai/hosting.json`.
- Never change the existing Sites `project_id` or D1 binding unless explicitly requested.
- Do not deploy merely because tests passed; deployment requires an explicit request.

## Verification

- Focused checks: `node scripts/test-fast.mjs`
- Full local checks: `node scripts/test-full.mjs`
- Validate a backup: `node scripts/validate-backup.mjs path/to/backup.json`
- Local isolated preview: `node scripts/preview-local.mjs`
- Sites artifact: `node scripts/build-site.mjs`
- Production smoke test: `node scripts/verify-deployment.mjs https://...`

Report:

- files changed;
- root cause and behavior changed;
- tests run and their result;
- data migration or compatibility impact;
- remaining risks;
- whether deployment was performed.

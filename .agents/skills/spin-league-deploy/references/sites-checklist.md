# Sites deployment checklist

## Before build

- Target Git SHA is known and reviewed.
- Relevant regression tests exist.
- `npm run health` and full tests passed, or skipped coverage is documented.
- Fresh JSON backup exists before any production data-affecting release.
- No real PIN, token, secret, registration phone data, or backup JSON is committed.

## Artifact identity

- `.openai/hosting.json` exists.
- Existing production `project_id` is unchanged.
- Production D1 binding remains `DB`.
- `dist/server/index.js`, `routes/`, `services/`, `db/`, shared `domain/`, and `formats/` are present.
- `dist/client/` contains current frontend files.
- Deployed `dist/client/src/styles/app.css` is a flattened stylesheet and contains no source `@import` chain.
- UI source marker resolves to the actual target Git SHA (`GIT <sha>`), not a synthetic build identifier.
- Migrations are copied but are not assumed safe to apply automatically.

## Staging release gate

- Deploy the exact candidate SHA to existing `spin-league-test` only.
- Staging uses its own Test D1 and never production D1.
- Footer/source marker matches the exact candidate SHA.
- Dispatch `Staging E2E` with required `expected_sha` equal to that deployed revision.
- E2E completes and cleans only its own `[E2E]` tournament.
- Existing Test D1 tournament IDs remain present.
- Public tournament API does not expose `participantDetails` or `registrationSettings.token`.

## Production publication

- Production deployment was explicitly approved.
- Update the existing `spin-league-tournament` Site; never create a replacement production Site/D1.
- A code-only deployment preserves current D1 records.
- Do not run restore/reset/migration unless separately approved.
- Generated historical rounds are data; new code does not retroactively regenerate them.
- Review the generated preview before publishing when available.

## After production publication

```bash
node scripts/verify-deployment.mjs https://spin-league-tournament.ckvs4517.chatgpt.site
```

Then manually confirm:

- public schedule loads;
- `/api/tournaments` returns existing public-safe records;
- admin login still works and admin views can access private participant details;
- at least one pre-existing tournament has the same revision/history;
- ranking and current-round display match the intended release;
- no backup restore prompt or unexpected migration occurred.

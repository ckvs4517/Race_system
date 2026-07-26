# Sites deployment checklist

## Before build

- Working tree reviewed.
- Relevant regression test exists.
- Full test suite passed or skipped coverage is documented.
- Fresh JSON backup downloaded before any data-affecting release.
- No real PIN, token, secret, registration phone data, or backup JSON is committed.

## Artifact identity

- `.openai/hosting.json` exists.
- Existing `project_id` is unchanged.
- D1 binding remains `DB`.
- `dist/server/index.js` contains the current Worker.
- `dist/server/domain/` and `dist/server/formats/` contain shared rules.
- `dist/client/` contains current frontend files.
- Migrations are copied but are not assumed safe to apply automatically.

## Publication

- Update the existing Spin League Site.
- Never create a new production Site merely to publish a code fix.
- A code-only deployment should preserve current D1 records.
- Generated historical rounds are data; new code does not retroactively regenerate them.

## After publication

```bash
node scripts/verify-deployment.mjs https://spin-league-tournament.ckvs4517.chatgpt.site
```

Then manually confirm:

- public schedule loads;
- `/api/tournaments` returns existing records;
- admin login still works;
- an existing tournament has the same revision/history;
- ranking and current-round display match the intended change;
- no backup restore prompt or migration was unexpectedly triggered.

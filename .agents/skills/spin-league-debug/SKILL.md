---
name: spin-league-debug
description: Diagnose and fix Spin League tournament, ranking, pairing, scoring, UI, synchronization, or historical-data bugs.
---

# Debug workflow

1. Run `node scripts/agent-context.mjs "<bug keywords>"`.
2. Reproduce the issue with the smallest existing test or a new regression case.
3. Classify ownership:
   - rendering or interaction: `src/views/`, `src/main.js`, `src/styles/app.css`;
   - client state or network: `src/data/store.js`;
   - shared business behavior: `src/domain/tournament.js`;
   - format-specific behavior: `src/formats/`;
   - authorization, persistence, conflict handling: `worker/index.js`;
   - schema: `db/schema.ts`, `.openai/drizzle/`.
4. Read `references/invariants.md` and `references/architecture-map.md`.
5. Make the smallest owning-layer fix. Do not compensate for a domain bug in a view.
6. Add a regression assertion.
7. Run the focused tests listed by `agent-context`, then `node scripts/test-fast.mjs`.
8. Before deployment, run `node scripts/test-full.mjs`.
9. Explain whether old D1 records are automatically reinterpreted, need normalization, or require a backup repair.

# Useful diagnosis questions

- Is the stored data wrong, or is a derived view/ranking wrong?
- Is the bug phase-specific (`preliminary`, `qualifier`, `final`)?
- Was a round already generated under an older algorithm?
- Is the browser holding a stale revision or ETag?
- Does the Worker recompute and validate the same rule as the frontend?
- Would replaying a match invalidate downstream results?

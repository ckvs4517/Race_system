---
name: spin-league-debug
description: Diagnose and fix Spin League tournament, ranking, pairing, scoring, UI, synchronization, security, or historical-data bugs.
---

# Debug workflow

1. Run `node scripts/agent-context.mjs "<bug keywords>"`.
2. Reproduce the issue with the smallest existing test or a new regression case.
3. Classify ownership using the current V2 boundaries:
   - app coordination: `src/main.js`;
   - interaction/controller: `src/features/<feature>/`;
   - rendering: `src/views/`, with schedule modules under `src/views/schedule/`;
   - client state/network/revision/ETag: `src/data/store.js`;
   - shared tournament business rules: facade `src/domain/tournament.js`, implementations in `src/domain/tournament/`;
   - format-specific behavior: `src/formats/`;
   - authorization/request coordination: `worker/routes/`, `worker/services/`;
   - D1 persistence: `worker/db/`;
   - schema: `db/schema.ts`, `.openai/drizzle/`;
   - Sites packaging: `scripts/build-site.mjs`;
   - style ownership: `src/styles/base/`, `src/styles/features/`, `src/styles/responsive/`.
4. Read `references/invariants.md` and `references/architecture-map.md`.
5. Make the smallest owning-layer fix. Do not compensate for a domain bug in a view or a persistence bug in client rendering.
6. Add a regression assertion for the failure mode.
7. Run focused tests from `references/test-matrix.md`, then `node scripts/test-fast.mjs`.
8. Before staging/deployment, run `node scripts/test-full.mjs --browser=required` when Chrome is available.
9. For changes to API visibility/auth, explicitly test both unauthenticated and authenticated representations and ETag transitions.
10. Explain whether old D1 records are automatically interpreted, need normalization, or require a separately approved repair.

# Useful diagnosis questions

- Is the stored data wrong, or only the derived view/ranking?
- Which layer owns the rule: feature, domain, format, Worker service, or D1 adapter?
- Is the bug phase-specific (`preliminary`, `qualifier`, `final`/Stage 2)?
- Was a round already generated under an older algorithm?
- Is the browser holding a stale revision or ETag?
- Does the Worker recompute and validate the same rule as the frontend?
- Would replaying a match invalidate downstream results?
- Could an unauthenticated API response expose `participantDetails`, registration tokens, or other private data?
- Could two judges issue commands against the same revision at nearly the same time?
- Does the build artifact behave differently from modular source (Worker bridge, CSS flattening, source SHA marker)?

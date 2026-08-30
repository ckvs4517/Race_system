# Spin League V2 Architecture Contract

## Status

V2 architecture phases 0–5 are complete. This file describes the current supported architecture, not a future migration plan.

The goal is to keep each module responsible for one coherent reason to change so new tournament features can be added without rebuilding the former `main.js`, `schedule.js`, `tournament.js`, `worker/index.js`, or `app.css` monoliths.

`scripts/check-architecture.mjs` enforces the mechanical parts of this contract. `AGENTS.md` contains the short operational rules used by AI/human contributors.

## Current structure

```text
src/
├─ main.js                         # thin app coordinator
├─ core/                           # router/build/runtime primitives
├─ data/
│  └─ store.js                     # browser API/state, auth, ETag/revision sync
├─ features/                       # user interactions/controllers
│  ├─ control/
│  ├─ data-management/
│  ├─ registration/
│  ├─ schedule/
│  └─ tournament-management/
├─ domain/                         # browser-independent business rules
│  ├─ tournament.js               # stable compatibility facade
│  ├─ tournament/                 # tournament lifecycle/roster/result modules
│  ├─ ranking/
│  └─ other focused domains
├─ formats/                        # competition-format algorithms
├─ views/
│  ├─ schedule.js                 # thin schedule facade
│  └─ schedule/                    # schedule rendering responsibilities
├─ ui/                             # reusable UI primitives
├─ export/                         # client export/render utilities
└─ styles/
   ├─ app.css                      # ordered source manifest only
   ├─ base/
   ├─ features/
   └─ responsive/

worker/
├─ index.js                        # thin Worker entry
├─ tournament-domain.js            # packaging bridge to shared tournament domain
├─ routes/                          # HTTP path/method coordination and responses
├─ services/                        # auth, validation, server actions
└─ db/                              # D1 statements and row persistence
```

There is intentionally no framework layer, DI container, global event bus, Redux-style store, or bundler architecture. Browser-native ES Modules remain the default.

## Responsibility boundaries

### `src/main.js`

Owns top-level route/render coordination. It may compose feature controllers and views, but feature-specific DOM behavior and tournament business rules do not belong here.

### `src/features/<feature>/`

Owns user-facing interactions and controllers. Features can call the browser store, domain functions, views, and reusable UI, but should not implement ranking/pairing rules or direct D1/network logic.

### `src/views/`

Owns HTML string rendering. Schedule rendering is decomposed under `src/views/schedule/`; `src/views/schedule.js` remains a thin facade. User-controlled text inserted into HTML must be escaped.

### `src/data/store.js`

Owns browser-side API access and official client state:

- admin session token in `sessionStorage`;
- GET ETags;
- revision conflict handling and safe retries;
- tournament refresh/polling;
- switching between public-safe and admin-private tournament representations.

Views/features must not introduce ad-hoc `fetch()` calls for official tournament state.

### `src/domain/`

Owns pure business rules. Domain code must not use DOM/browser state, storage, or network APIs and must not import views/features/store/UI.

`src/domain/tournament.js` is the stable public facade over focused modules in `src/domain/tournament/`. External callers use the facade; deep imports are reserved for domain-internal composition.

Important tournament modules include:

- `lifecycle.js`: create/edit, scheduling transitions, start/finish;
- `normalization.js`: backward-compatible record normalization;
- `roster.js` / `participant-model.js`: draft roster/check-in invariants;
- `registration.js` / `registration-settings.js`: confirmed participant and private-link settings;
- `matches.js` / `score-validation.js`: formal result, forfeit, replay, withdrawal validation;
- `standings.js` / `swiss-actions.js`: standings and Swiss Stage 2 actions;
- `visibility.js`: public-safe tournament projection;
- narrow support modules for pairings, metadata, legacy compatibility, factory, and constants.

### `src/formats/`

Owns format-specific algorithms such as single elimination, Swiss, round robin, and win streak. Format code is browser/network independent.

### `worker/`

- `worker/index.js`: only Worker entry/static asset handoff/API delegation.
- `worker/routes/`: HTTP request coordination, response shaping, ETag behavior.
- `worker/services/`: admin auth, input validation, official action dispatch, record validation.
- `worker/db/`: all D1 `.prepare()` / `.batch()` calls.
- `worker/tournament-domain.js`: the only packaging bridge from Worker code to the shared tournament domain.

No D1 statements may drift back into routes/services.

### `src/styles/`

Phase 5 source CSS is modular for ownership, while cascade order remains contractual:

```text
app.css manifest
  → base/foundation.css
  → feature ranges in historical cascade order
  → base/footer.css / responsive ranges
  → later feature ranges
```

Do not reorder manifest imports casually. `tests/v2-css-boundary.test.mjs` locks the source order.

For event-site performance, `scripts/build-site.mjs` expands the manifest into a single `dist/client/src/styles/app.css`. Source remains modular; deployed clients do not pay a separate request for every source CSS module.

## Dependency direction

Conceptually:

```text
main
 ↓
features ─────→ views / ui
 ↓
store          domain ─────→ formats
                  ↑
             shared rules

Worker:
index
 ↓
routes
 ↓
services ─────→ tournament-domain bridge
 ↓                    ↓
db               src/domain + formats
```

Dependencies must point toward stable business rules. Domain/format code must never depend back on browser/UI layers.

## Public/private data boundary

A tournament record stored in D1 can contain private participant information:

- `participantDetails[player].phone`
- `participantDetails[player].notes`
- `participantDetails[player].answers`
- `registrationSettings.token`

These fields are admin/private data.

Unauthenticated:

- `GET /api/tournaments`
- `GET /api/tournaments/:id`

must return `toPublicTournament(...)`, which removes `participantDetails` and `registrationSettings.token` while preserving the public roster, schedule, standings, event information, and safe registration settings.

Authenticated admin GETs return the full tournament record. Public and admin representations use distinct ETag namespaces so a public cached validator cannot cause an authenticated request to receive an incorrect `304`.

The browser store must reload full tournament data after successful admin login and must remove private fields from in-memory state immediately on logout.

This privacy boundary is a release invariant and is covered by domain, registration, store-transition, and deployment-smoke tests.

## Tournament persistence and concurrency

D1 stores one tournament JSON record plus a separate integer revision. Official changes use optimistic compare-and-swap semantics:

```sql
UPDATE tournaments
SET data = ?, revision = ?, updated_at = CURRENT_TIMESTAMP
WHERE id = ? AND revision = ?
```

A stale revision must not overwrite newer data. Worker action endpoints read the latest record, validate/derive the official result on the server, then write only if the expected revision still matches.

The client may retry a command once when it is safe to reapply to the newest revision. Formal actions such as scoring remain server-authoritative.

ETags reduce unchanged GET payloads but do not replace revision checks for writes.

## API ownership

Public endpoints are read-only except the token-protected participant-information submission endpoint. Admin mutations require a valid Bearer session.

Formal tournament results must use the command endpoint rather than client-calculated full-record overwrite. Whole-tournament `PUT` remains restricted to preparation-stage editing; whole-collection `PUT` is reserved for explicit backup restore.

When adding a new official operation:

1. define/extend the shared domain behavior;
2. expose a Worker action type;
3. validate payload and current state server-side;
4. preserve revision conflict behavior;
5. add focused domain/API/sync tests.

## File-growth guardrails

Architecture limits are intentionally tighter after migration:

- `src/main.js`: thin coordinator limit;
- `src/views/schedule.js`: thin facade;
- `src/domain/tournament.js`: thin facade;
- `worker/index.js`: thin entry;
- `src/styles/app.css`: thin source manifest;
- decomposed schedule/domain/Worker/style modules have soft/hard size limits so a monolith cannot simply reappear under a new filename.

A size warning is not automatically a bug, but it signals that a responsibility split should be considered before adding more behavior. Do not raise limits merely to make CI pass.

## Build contract

`scripts/build-site.mjs` creates the ChatGPT Sites artifact and must preserve:

- the existing `.openai/hosting.json` identity;
- all D1 migration files;
- Worker route/service/db modules;
- shared domain/format modules through the Worker bridge;
- the actual source Git marker displayed in the UI;
- a single flattened deployed stylesheet produced from the ordered Phase 5 manifest.

The build must never rewrite production data.

## Test and release layers

A green unit test is not equivalent to production confidence. V2 uses multiple layers:

1. focused Node regressions for changed behavior;
2. `node scripts/test-fast.mjs` for common invariants;
3. `node scripts/test-full.mjs --browser=required` for all Node tests, browser flows, and Sites build;
4. standard GitHub `Test and build` CI;
5. deployment to permanent staging `spin-league-test` using the separate Test D1;
6. manual `Staging E2E` with `expected_sha` equal to the exact deployed Git source revision;
7. only after explicit approval: production preview/publish and read-only verification of existing production data.

Staging E2E is hard-locked to `spin-league-test.ckvs4517.chatgpt.site`. It must never be repointed to production.

## Completed V2 phases

- Phase 0 — architecture contract, health checks, CI guardrails: complete.
- Phase 1 — `main.js` feature/controller extraction: complete.
- Phase 2 — schedule view decomposition: complete.
- Phase 3 — tournament domain decomposition with stable facade: complete.
- Phase 4 — Worker route/service/db decomposition: complete.
- Phase 5 — CSS ownership decomposition with ordered manifest: complete.

The post-refactor release audit adds privacy/release/build safeguards without changing tournament formats or D1 schema.

## Next functional work

Scoring V2 (GitHub Issue #13) is the next planned feature after the post-refactor audit is accepted on staging. It should be implemented on these boundaries rather than introducing scoring state back into `main.js`, views, or Worker routes.

## Known architectural/operational debt

These are not hidden by a green CI result:

- all organizers/judges still share one PIN;
- admin login has no rate limiter or individual account/audit log;
- private registration submission has token secrecy/honeypot protection but no platform rate limiter/Turnstile;
- synchronization is polling + revision locking, not realtime push;
- live staging E2E exercises one browser/admin session and cannot reproduce every multi-device/network race;
- collection GET currently reads/parses every tournament record, which may need pagination/summary rows if history grows substantially;
- backup restore intentionally replaces the tournaments collection and therefore requires deliberate operator confirmation/backups;
- browser/Web Bluetooth support varies by platform.

Treat these as explicit release risks, not as reasons to bypass tests or data-safety rules.

# Spin League V2 Architecture Contract

## Goal

Spin League V2 uses a hybrid architecture: user-facing behavior is organized by feature, while tournament rules, format algorithms, API communication, and reusable UI stay in dedicated layers.

The objective is not to maximize file count. The objective is to keep each module responsible for one coherent reason to change, so future features can be added without turning `main.js`, `schedule.js`, `tournament.js`, or `worker/index.js` into new monoliths.

This document is a repository contract. AI agents and human contributors must follow it. `scripts/check-architecture.mjs` enforces the rules that can be checked automatically.

## Target structure

```text
src/
├─ app/                         # bootstrap, routing coordination, app-level state
├─ features/                    # user-facing features and interaction controllers
│  ├─ schedule/
│  ├─ scoreboard/
│  ├─ registration/
│  ├─ tournament-management/
│  ├─ data-management/
│  ├─ speedometer/
│  └─ spinlab/
├─ domain/                      # business rules; no DOM or network access
│  ├─ tournament/
│  ├─ registration/
│  └─ scoring/
├─ services/                    # browser/server API communication
├─ formats/                     # competition-format algorithms
├─ ui/                          # reusable UI primitives only
├─ export/                      # export/rendering utilities
└─ main.js                      # eventual thin bootstrap entry point

worker/
├─ routes/                      # request routing/handlers
├─ services/                    # server application services
├─ db/                          # D1 persistence adapters
└─ index.js                     # thin Worker entry point
```

The repository is currently migrating toward this structure. Existing paths remain supported during the transition, but new code must move toward the target instead of increasing legacy coupling.

## Layer responsibilities

### `src/app/`

Owns application bootstrap and top-level coordination.

May know about features, services, router state, and app-level state. It must not contain tournament business rules or feature-specific DOM details.

### `src/features/<feature>/`

Owns a user-visible capability and its interactions. A feature may compose views, domain functions, services, and reusable UI.

Examples: opening a match, filtering tournament history, submitting registration, operating the scoreboard.

A feature must not implement tournament ranking/pairing rules or direct D1 access.

### `src/domain/`

Owns product/business rules that should be testable without a browser.

Domain code MUST NOT use:

- `window`
- `document`
- `navigator`
- `localStorage` / `sessionStorage`
- `fetch`
- UI modules
- feature controllers
- API/data-store modules

### `src/formats/`

Owns format-specific algorithms such as Swiss, single elimination, round robin, and win streak.

Format code MUST remain browser-independent and must not depend on views, UI, features, API clients, or app coordination.

### `src/services/`

Owns HTTP/API communication. Once a feature is migrated to V2 services, its feature/controller must not make direct network requests.

`src/data/store.js` is a legacy API/state boundary and will be decomposed gradually. Do not expand it with unrelated feature logic during V2 work.

### `src/ui/`

Owns reusable presentation primitives shared by multiple features. UI primitives must not become a second business/domain layer.

### `worker/`

`worker/index.js` is a thin Worker entry point. HTTP path/method coordination and response shaping belong in `worker/routes/`; authorization, server-side validation, revision metadata helpers, and server-authoritative action dispatch belong in `worker/services/`; D1 SQL belongs only in `worker/db/` persistence adapters.

`worker/tournament-domain.js` is the packaging bridge from Worker modules to the shared tournament domain. Worker route/service code must not reintroduce direct D1 statements outside `worker/db/`.

## Dependency direction

The desired dependency flow is:

```text
app
 ↓
features ─────→ ui
 ↓  ↓
services  domain ─────→ formats
```

Server-side:

```text
worker/index
 ↓
routes
 ↓
services/domain
 ↓
db adapters
```

Dependencies should point inward toward stable rules. Domain and format code must never depend back on browser/UI layers.

## Public APIs

When a domain is split into several files, expose its supported surface through an `index.js` facade where practical.

Prefer:

```js
import { recordMatchResult } from '../domain/tournament/index.js';
```

instead of importing internal implementation details from deeply nested files.

Internal files may change without forcing unrelated features to change.

## Naming rules

Do not create generic dumping-ground modules such as:

- `utils.js`
- `helpers.js`
- `common.js`
- `misc.js`
- `shared.js`

Use responsibility-specific names such as `score-validation.js`, `date-format.js`, or `tournament-id.js`.

A generic file may only be introduced when its responsibility is genuinely coherent and documented.

## File growth policy

Large file size is a warning signal, not proof of bad architecture. During the V2 transition, existing hotspots have a recorded baseline and should trend downward:

| File | V2 starting size |
| --- | ---: |
| `src/main.js` | 42,035 bytes |
| `src/views/schedule.js` | 52,725 bytes |
| `src/domain/tournament.js` | 39,715 bytes |
| `worker/index.js` | 29,513 bytes |
| `src/styles/app.css` | 106,621 bytes |

Unmigrated hotspots warn when they grow beyond their baseline and fail if they grow more than 5% without first updating the architecture plan. Once a migration phase lands, the old hotspot is removed from the legacy growth baseline and replaced by a much tighter migrated-facade/module limit. Updating a baseline simply to bypass the check is not acceptable.

The long-term intent is:

- `main.js`: thin bootstrap/coordinator
- `schedule.js`: split into coherent schedule feature/view modules
- `tournament.js`: preserve a stable public API while internal responsibilities are separated
- `worker/index.js`: thin request router/entry point
- `app.css`: feature/component styles instead of one global stylesheet

## Change rules

Before adding code:

1. Identify the owning feature or layer.
2. Extend an existing coherent module when it owns the behavior.
3. If the behavior does not fit cleanly, create/refactor the correct boundary instead of adding a special case to a hotspot.
4. Keep refactor-only PRs behavior-preserving.
5. Keep production tournament JSON and D1 compatibility unless a separately reviewed migration is explicitly required.
6. Add regression coverage before or with behavior changes.

## V2 migration phases

### Phase 0 — Architecture guardrails

- architecture contract
- agent instructions
- automated architecture check
- PR checklist
- CI architecture validation
- health reporting

No user-visible behavior changes.

### Phase 1 — App/controller extraction

Reduce `main.js` by moving feature interactions/controllers to feature modules. Do not redesign global state at the same time.

### Phase 2 — Schedule feature decomposition

Split tournament list/history, bracket/match cards, standings, roster, and schedule interactions into coherent modules.

### Phase 3 — Tournament domain decomposition

`src/domain/tournament.js` is now a compatibility facade over `src/domain/tournament/index.js`; existing callers keep the same public imports while internal ownership is split by responsibility:

- lifecycle and scheduling transitions: `lifecycle.js`
- backward-compatible record normalization: `normalization.js`
- formal result, replay, forfeit, and withdrawal operations: `matches.js`
- standings and Swiss-stage queries/actions: `standings.js`, `swiss-actions.js`
- draft roster, participant invariants, and registration: `roster.js`, `participant-model.js`, `registration.js`, `registration-settings.js`
- pairings, metadata, legacy compatibility, score validation, constants, and record factory remain narrow support modules

Outside callers must continue importing through `src/domain/tournament.js`; deep imports into `src/domain/tournament/` are reserved for domain-internal composition. Tournament JSON semantics, format strategies, Worker API contracts, and D1 persistence are unchanged by this phase.

### Phase 4 — Worker decomposition

`worker/index.js` is now a thin entry point that delegates API handling to `worker/routes/api.js`. The old Worker monolith is separated into stable server responsibilities:

- API path/method coordination, response shaping, ETag/304 behavior: `worker/routes/`
- authorization/session signing, registration validation, tournament payload validation, revision helpers, and server-authoritative action dispatch: `worker/services/`
- tournament and registration D1 statements, row mapping, optimistic update/delete helpers, and backup replacement persistence: `worker/db/`
- shared tournament business rules remain in `src/domain/tournament.js`, reached through the packaging bridge `worker/tournament-domain.js`

Phase 4 preserves all existing API paths, HTTP status behavior, JSON payload shapes, authorization checks, ETags, revision conflict responses, server-side action validation, tournament JSON semantics, D1 schema, and production data. `scripts/build-site.mjs` packages the decomposed Worker modules and rewrites only the dedicated domain bridge for the Sites server artifact.

Architecture checks require `worker/index.js` to remain below 2 KB, bound Worker route/support module growth, and reject direct D1 `.prepare()` / `.batch()` calls outside `worker/db/`.

### Phase 5 — CSS organization

Move feature/component styles out of the global stylesheet without visual changes.

### After V2 architecture stabilization

Implement Scoring V2 (GitHub Issue #13) on top of the new boundaries.

## Enforcement policy

Architecture checks are deliberately progressive.

Hard failures during Phase 0:

- forbidden browser/network dependencies inside domain/format code
- forbidden cross-layer imports from domain/format code
- circular relative JavaScript module dependencies
- generic dumping-ground module names
- legacy hotspot growth beyond 5% of the V2 baseline

Warnings during Phase 0:

- hotspot growth above the baseline but below the hard limit
- legacy structures that are scheduled for later V2 phases

As each migration phase lands, `scripts/check-architecture.mjs` must be tightened so the old architecture cannot silently return.

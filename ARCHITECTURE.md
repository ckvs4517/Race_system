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
└─ index.js                     # eventual thin Worker entry point
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

The Worker entry point should progressively become routing/coordination only. Business validation belongs in server services/domain code, and D1 access belongs in persistence adapters.

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

`check-architecture` warns when a hotspot grows beyond its baseline and fails if it grows more than 5% without first updating the architecture plan. Updating the baseline simply to bypass the check is not acceptable.

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

Separate lifecycle, normalization, match operations, ranking-related shared logic, and registration concerns while keeping a stable domain facade.

### Phase 4 — Worker decomposition

Separate routing, server services, and D1 persistence while preserving all API contracts, revision checks, and server-side validation.

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

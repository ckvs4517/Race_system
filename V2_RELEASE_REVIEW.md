# Spin League V2 Release Review

## Purpose

This document records the post-refactor release audit requested before V2 is considered ready for production use. It separates problems that were found/fixed from risks that remain outside current automated coverage.

Production was not modified during this audit.

## Baseline reviewed

V2 architecture baseline before audit:

```text
branch: v2/codebase-refactor
commit: 635cf44870a0823ff0d8fd636a5b74d1f353c9cd
```

Evidence already available for that baseline:

- standard `Test and build #191`: success;
- staging deployment reported the same `GIT 635cf44` source;
- Staging E2E run `33282154089`: success, 21 checks;
- the E2E report observed live SHA `635cf44870a0823ff0d8fd636a5b74d1f353c9cd`.

The previous E2E workflow allowed `expected_sha` to be left empty, so that run proved the live marker was valid and happened to match the candidate, but did not enforce the match as a workflow input. The audit tightens this gate.

## Main/V2 ancestry

At audit start:

```text
main: ee92c0c407ed9df4db02944db6f651e01d158167
v2/codebase-refactor: 635cf44870a0823ff0d8fd636a5b74d1f353c9cd
```

`main...v2/codebase-refactor` reports V2 ahead and `behind_by: 0`, with the merge base equal to the current main SHA. The V2 refactor therefore contains all commits currently present on main; no later main hotfix was missing from the reviewed baseline.

## Findings fixed in the audit branch

Audit branch:

```text
v2/post-refactor-audit
```

### 1. High — public tournament API exposed private participant data

Before the audit, unauthenticated:

```text
GET /api/tournaments
GET /api/tournaments/:id
```

returned the full stored tournament JSON. That could include:

- `participantDetails[player].phone`
- `participantDetails[player].notes`
- `participantDetails[player].answers`
- `registrationSettings.token`

The UI did not normally display those values publicly, but they were still available to anyone inspecting the API/network response.

This behavior also exists in the current `main` baseline; it was inherited by V2 and was not introduced by the architecture split.

Audit fix:

- added domain-level `toPublicTournament()` projection;
- public tournament list/single GETs remove `participantDetails` and registration token;
- authenticated admin GETs still receive the full record;
- public/admin ETags use distinct namespaces;
- client store reloads private data after login;
- logout immediately removes private fields from browser memory;
- regression tests and deployment smoke tests enforce the boundary.

Production implication: until a build containing this fix is explicitly deployed, the current production/main behavior should be treated as potentially exposing these fields through the public API.

### 2. Medium — Phase 5 CSS source split added runtime requests

Phase 5 correctly preserved CSS bytes/cascade but `app.css` was a manifest with multiple `@import` requests. The previous build copied source files directly, so staging/production clients could make separate network requests for each module.

This is functionally correct but undesirable at an event venue with weak Wi-Fi/mobile connectivity.

Audit fix:

- source CSS remains modular;
- `scripts/build-site.mjs` expands the ordered manifest into one deployed `dist/client/src/styles/app.css`;
- build fails if the deployed stylesheet still contains `@import`;
- source architecture/cascade guards remain intact.

### 3. Medium — staging release acceptance did not require the candidate SHA

The live E2E runner can compare its observed `GIT` marker to `EXPECTED_GIT_SHA`, but the workflow input was optional.

Audit fix:

- GitHub Actions `Staging E2E` now requires `expected_sha`;
- workflow validates a 7–40 hex SHA before running;
- regression test locks this behavior;
- deploy/test docs now state that an exact-SHA run is the release gate.

### 4. Security regression coverage — HTML string views

The application intentionally uses HTML string templates. Existing key views escape tournament/player/event/registration values, but this is easy to regress.

Audit action:

- added `tests/html-escaping.test.mjs` with hostile tournament/player/custom-field strings;
- added it to the fast regression suite.

No confirmed XSS bug was found in the sampled public schedule/registration/admin paths during this audit.

## Architecture review

The V2 split itself is structurally healthy:

- `src/main.js` is a coordinator rather than a feature monolith;
- schedule rendering is behind a thin facade;
- tournament domain is behind a stable facade with focused internal modules;
- Worker entry delegates to route/service/db layers;
- D1 SQL remains in `worker/db/`;
- CSS source ownership is split while deployment can remain a single stylesheet;
- architecture guard checks dependency direction, cycles, generic dumping-ground modules, and module growth limits.

Current architecture warnings:

- `src/views/schedule/decision-panels.js` is close to the schedule module hard size limit;
- `src/styles/features/schedule.css` is above the Phase 5 soft warning threshold but below the hard limit.

These are maintainability warnings, not reproduced runtime bugs.

## Concurrency / multi-device review

Current safeguards:

- every official tournament write uses an expected revision;
- D1 writes use conditional update semantics;
- stale writes return 409 rather than overwriting newer data;
- client command flow can apply the newest server record and retry a safe command once;
- ETags reduce unchanged GET work but do not replace write revision checks;
- request timeout prevents a lost mobile connection from leaving saving/polling permanently locked.

Automated tests cover stale revision/conflict retry behavior. Live staging E2E, however, uses a single browser session; it is not a two-device simultaneous-scoring soak test.

## Remaining risks not fully solved by this audit

### Security / abuse

- All organizers/judges share one PIN.
- Login has no rate limit/lockout/individual user identity.
- There is no operation audit log.
- Private participant submission has an unguessable token and honeypot but no Turnstile/platform rate limiter.

For a small/private event deployment these can be accepted with a strong PIN and controlled link sharing, but they remain real security debt if usage becomes broadly public.

### Real-world device/network behavior

Automated tests cannot fully reproduce:

- several judges scoring from phones/tablets at exactly the same time;
- Wi-Fi AP roaming, captive portals, mobile background suspension, or intermittent packet loss;
- every Safari/Chrome/iOS/Android difference;
- Web Bluetooth support differences;
- partial Cloudflare/D1 outages.

Revision locking prevents silent stale overwrite, but user experience under severe network failure still requires real-event observation.

### Data scale

The collection endpoint currently reads/parses all tournament rows when producing the tournament list and collection ETag. This is acceptable at current scale, but a large historical archive may eventually require a public summary table/query or pagination.

### Destructive restore

Whole-collection JSON restore intentionally replaces the tournaments collection. It must stay a deliberate admin operation with a fresh backup; it should never become an automatic deployment step.

### Legacy registrations rows

The new private participant flow writes confirmed participants directly into tournament JSON. The old `registrations` table remains for compatibility/history and has no foreign-key cascade when a tournament is deleted.

## Automated audit evidence

Validation PR: `#31 V2 post-refactor release audit`.

GitHub `Test and build #192`, run `33283194407`, passed on audit implementation SHA:

```text
cc4771ccee30f68803408f25c37964cc9f9a0460
```

The run completed:

- repository/architecture health: pass;
- architecture graph: 0 dependency violations, 0 cycles;
- all discovered Node tests: 42 pass;
- `tests/admin-privacy-transition.test.mjs`: pass;
- `tests/registration.test.mjs` public/private API assertions: pass;
- `tests/html-escaping.test.mjs`: pass;
- Sites build including CSS flatten: pass;
- browser `tournament.test.html`: `PASS 62`;
- browser `full-flow.test.html`: `PASS 38 full browser flow`;
- build structure and deployable artifact: pass.

The only architecture output was the two maintainability warnings listed above.

## Release checklist for the audited candidate

Before calling the audit complete:

1. focused privacy/auth/build tests pass — complete;
2. full Node suite/build passes — complete;
3. browser tournament/full-management flows pass — complete;
4. standard GitHub `Test and build` passes on the audit implementation — complete (`#192`);
5. audit head is reviewed/fast-forwarded into `v2/codebase-refactor` — pending;
6. exact final V2 SHA is deployed to `spin-league-test` — pending;
7. footer shows that exact `GIT` SHA — pending;
8. `Staging E2E` is dispatched with the same required `expected_sha` and passes — pending;
9. public staging `/api/tournaments` contains no private participant details or registration token — pending live deployment verification;
10. only after explicit production approval: take/confirm a fresh backup, preview/publish to the existing production Site, run deployment smoke, and verify pre-existing production tournament data remains readable.

## Audit status

```text
Code/privacy/build/documentation audit: automated validation passed
Standard CI: PASS — Test and build #192 / run 33283194407
Exact-SHA staging acceptance: pending final audit candidate deployment
Production deployment: not performed
```

Do not mark this review production-ready until the final V2 SHA itself passes the exact-SHA staging gate.

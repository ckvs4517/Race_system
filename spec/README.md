# Spin League Specification Guide

This directory is the specification layer for Spin League's lightweight, spec-anchored development workflow.

## Structure

```text
spec/
├─ current/                 # What the system is expected to do today
├─ changes/<issue-or-name>/ # Proposed non-trivial behavior changes
├─ templates/               # Templates for future change specs
└─ *.md                     # Older feature specs kept as historical design input
```

## Source-of-truth model

- `spec/current/` describes current product/domain behavior.
- `ARCHITECTURE.md` describes architecture boundaries.
- `AGENTS.md` describes contributor/AI operational constraints.
- Tests verify behavior and invariants.
- Code implements the behavior.

If a current spec, tests, and implementation disagree, do not silently choose one. Identify the mismatch, decide which behavior is intended, then update the spec and regression tests with the implementation.

The older feature specs currently stored directly under `spec/` predate this convention. They are useful historical design input, but are not automatically normative when they conflict with `spec/current/`, tests, or the implemented system.

## Current specs

- `current/tournament-lifecycle.md`
- `current/scoring-and-repair.md`
- `current/formats-and-ranking.md`
- `current/participants-and-registration.md`
- `current/privacy-and-auth.md`
- `current/sync-and-persistence.md`
- `current/release-and-deployment.md`

These specs intentionally describe behavior at domain/workflow granularity rather than one document per function or source file.

## When a change spec is required

Create `spec/changes/<issue-or-name>/spec.md` before implementation when a change affects one or more of:

- scoring, ranking, pairing, tournament lifecycle, or format behavior;
- API behavior or server-authoritative actions;
- tournament data semantics or persistence;
- privacy, authentication, or public/admin boundaries;
- multi-device synchronization or conflict handling;
- non-trivial registration/roster workflows;
- release/deployment safety;
- a user workflow whose acceptance criteria are not obvious from the issue alone.

A separate change spec is normally unnecessary for wording-only edits, isolated styling adjustments, obvious typo fixes, or small regressions whose intended behavior is already unambiguously covered by a current spec.

## Lightweight SDD flow

```text
GitHub Issue
  -> Change Spec
  -> Implementation + Regression Tests
  -> CI / Staging verification as applicable
  -> Merge accepted behavior into spec/current
  -> Archive or retain the change spec for history
```

## Requirement style

Prefer observable requirements with stable IDs.

Example:

```text
SCORE-003

WHEN an administrator confirms a formal match
THEN the server SHALL reject a tied final score
AND the winner SHALL have at least 4 points.
```

Requirement IDs should remain stable when wording is clarified. Replace or retire an ID only when the underlying behavior changes.

## Writing rules

1. Specify expected behavior, not line-by-line implementation.
2. Name architectural ownership only when it constrains a safe implementation.
3. Record compatibility and data-safety requirements explicitly.
4. Include acceptance criteria that can map to regression tests.
5. Keep speculative future behavior out of `current/`; place it in a change spec or GitHub issue.

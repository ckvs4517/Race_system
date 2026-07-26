---
name: spin-league-test
description: Select and run compact, deterministic Spin League tests for a code change.
---

# Test workflow

1. Read `references/test-matrix.md`.
2. Run only the smallest owning tests while editing.
3. Run `node scripts/test-fast.mjs` when the focused fix passes.
4. Run `node scripts/test-full.mjs` before deployment or after cross-layer changes.
5. Browser tests are skipped by default; use `--browser=required` when the local Chrome environment is known to work and the change affects rendering, events, navigation, or end-to-end management flow.
6. Use `--browser=skip` only when a browser is unavailable and state that browser coverage was skipped.
7. On failure, report the first failing command and its captured output; do not flood the context with successful logs.

# Commands

```bash
node scripts/test-fast.mjs
node scripts/test-full.mjs
node scripts/test-full.mjs --browser=required
node scripts/test-full.mjs --browser=skip --skip-build
```

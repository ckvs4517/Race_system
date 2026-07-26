# Test conventions

- Tests use Node built-ins only; do not add a package dependency for ordinary assertions or runners.
- Every bug fix should include a regression assertion that fails before the fix.
- Keep output compact: one final PASS line per test file; include details only on failure.
- Domain/format tests should use fixed input or injected randomness.
- Browser flow tests must not contact production services.
- Update `.agents/skills/spin-league-test/references/test-matrix.md` when adding a major source area or test file.

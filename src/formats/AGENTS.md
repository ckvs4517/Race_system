# Tournament format rules

- Keep format algorithms deterministic except where an injected/random function is already part of the API.
- Do not mix HTML, HTTP, storage, or authentication into format modules.
- Preserve phase metadata (`phase`, `phaseRound`, `seriesId`, `seriesPlayers`) when modifying Swiss rounds.
- Do not derive final-stage standings from preliminary-stage statistics.
- `no_show` participants remain in the full roster but rank after every checked-in participant.
- A format change requires focused tests plus `tests/format-matrix.test.mjs`.
- Read `.agents/skills/spin-league-debug/references/invariants.md` before changing ranking, pairing, bye, replay, or progression logic.

# Backup format notes

Top level:

```json
{
  "format": "spin-league-backup",
  "version": 1,
  "exportedAt": "ISO-8601",
  "tournaments": []
}
```

Important tournament fields:

- `id`, `name`, `format`, `status`, `revision`;
- `players`, `participantStates`;
- `rounds[].matches[]` including scores, winner, status, outcome and timestamps;
- `playerStats`, `champion`;
- Swiss: `swissVersion`, `swissStage`, `qualifierSeriesCount`, `activeQualifierSeriesId`, `finalists`;
- `registrationSettings` contains a public registration token but backup exports intentionally exclude individual registration rows and phone numbers.

Repair principles:

- An unplayed generated round can be removed without losing results, but stage/derived fields must be updated.
- Do not remove completed rounds merely to change how the UI displays history.
- `playerStats` should match the applicable preliminary/formal history expected by the current code.
- Restored tournaments receive revisions according to the Worker restore path; backup revision values are historical context, not a concurrency guarantee after restore.

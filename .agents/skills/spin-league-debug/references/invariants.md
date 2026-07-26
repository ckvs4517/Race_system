# Business and data invariants

## Roster and attendance

- `players` is the full formal roster and must not contain duplicates.
- `participantStates[player]` describes attendance/lifecycle state.
- `active`: eligible for future pairings.
- `no_show`: never checked in; excluded from formal pairings and ranked after every checked-in participant.
- `withdrawn`: participated or checked in, then left; historical results remain.
- A 0-win checked-in participant ranks above every `no_show` participant.

## Match integrity

- A formal match references roster players or the internal bye marker.
- A completed match has numeric scores, a winner matching the greater score, and a completion timestamp.
- A tied score cannot be completed.
- The winner must have at least 4 points.
- A forfeit retains explicit outcome/reason metadata.

## Round integrity

- Already generated rounds are historical data. A new pairing algorithm must not silently rewrite them.
- Replaying an earlier result must clear or regenerate every dependent downstream round/result.
- Round and match IDs should be unique within a tournament.
- Arena assignment is presentation/scheduling metadata; it must not change match identity or results.

## Swiss

- `swissVersion: 2` means four preliminary rounds, qualification decision, optional qualifier series, and a four-player final round robin.
- Preliminary statistics use preliminary rounds only.
- Qualifier statistics use the active qualifier `seriesId` only.
- Final statistics use final rounds only.
- Entering the final can display finalists as 0-0 in that stage, while preliminary history remains stored and exportable.
- Completion of the fourth preliminary round moves to `swissStage: qualification`; it must not create a fifth preliminary round.

## Single elimination

- Only active winners advance.
- A bye is not a played match but increments bye count where applicable.
- Champion status outranks other checked-in participants, but never moves a `no_show` above a checked-in participant.

## Persistence and synchronization

- D1 stores one tournament JSON document plus a numeric revision.
- The Worker validates official actions and increments revision atomically.
- A stale expected revision returns a conflict and the latest tournament.
- Full-list restore is exceptional and must be preceded by an explicit backup.
- ETag 304 responses must not trigger unnecessary state replacement/rendering.

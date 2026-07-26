---
name: spin-league-backup
description: Inspect, validate, or repair Spin League JSON backups while preserving the original and unrelated tournaments.
---

# Backup workflow

1. Work from the newest full export unless the user explicitly requests an older snapshot.
2. Run `node scripts/validate-backup.mjs <input.json>` before editing.
3. Read `references/backup-format.md`.
4. Identify the target tournament by both ID and name when possible.
5. Preserve the original file and write a clearly named new output file.
6. Preserve every unrelated tournament byte-for-byte where practical.
7. When removing a generated round, also make stage, finalists, champion, active series, total rounds, and derived stats coherent.
8. Never invent a result. Missing scores remain unplayed unless the user supplies the result.
9. Validate the repaired output and summarize exactly what was removed, retained, and recalculated.
10. Remind the user that full restore replaces the cloud tournament collection and requires a fresh safety export.

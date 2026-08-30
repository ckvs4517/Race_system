/** D1 persistence adapter for tournament rows and optimistic revisions. */
export async function readTournament(database, id) {
  const row = await database.prepare('SELECT data, revision FROM tournaments WHERE id = ?').bind(String(id)).first();
  return row ? { ...JSON.parse(row.data), revision: Number(row.revision) || 0 } : null;
}

export async function listTournaments(database) {
  const result = await database.prepare('SELECT data, revision FROM tournaments ORDER BY updated_at DESC').all();
  return result.results.map((row) => ({ ...JSON.parse(row.data), revision: Number(row.revision) || 0 }));
}

export async function insertTournament(database, tournament) {
  await database.prepare('INSERT INTO tournaments (id, data, revision, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)')
    .bind(String(tournament.id), JSON.stringify(withoutRevision(tournament)), tournament.revision).run();
}

export async function updateTournamentIfRevision(database, tournament, expectedRevision) {
  const result = await database.prepare('UPDATE tournaments SET data = ?, revision = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND revision = ?')
    .bind(JSON.stringify(withoutRevision(tournament)), tournament.revision, String(tournament.id), expectedRevision).run();
  return changedRows(result);
}

export async function deleteTournamentIfRevision(database, id, expectedRevision) {
  const result = await database.prepare('DELETE FROM tournaments WHERE id = ? AND revision = ?').bind(String(id), expectedRevision).run();
  return changedRows(result);
}

export async function replaceAllTournaments(database, tournaments) {
  const statements = [database.prepare('DELETE FROM tournaments')];
  for (const tournament of tournaments) {
    statements.push(database.prepare('INSERT INTO tournaments (id, data, revision, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)')
      .bind(String(tournament.id), JSON.stringify(withoutRevision(tournament)), tournament.revision));
  }
  await database.batch(statements);
}

function withoutRevision(tournament) {
  const copy = { ...tournament };
  delete copy.revision;
  return copy;
}

function changedRows(result) {
  return Number(result?.meta?.changes ?? result?.changes ?? 0) > 0;
}

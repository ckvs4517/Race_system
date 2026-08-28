/** D1 persistence adapter for private registration review rows. */
const SELECT_COLUMNS = 'id, tournament_id, display_name, phone, notes, answers, status, created_at, updated_at';

export async function listRegistrations(database, tournamentId) {
  const result = await database.prepare(`SELECT ${SELECT_COLUMNS} FROM registrations WHERE tournament_id = ? ORDER BY created_at ASC`)
    .bind(String(tournamentId)).all();
  return result.results.map(mapRegistrationRow);
}

export async function readRegistration(database, id) {
  const row = await database.prepare(`SELECT ${SELECT_COLUMNS} FROM registrations WHERE id = ?`).bind(String(id)).first();
  return row ? mapRegistrationRow(row) : null;
}

export async function updateRegistrationStatus(database, id, status) {
  await database.prepare('UPDATE registrations SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(status, String(id)).run();
}

export async function markRegistrationApproved(database, id) {
  await database.prepare("UPDATE registrations SET status = 'approved', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(String(id)).run();
}

function mapRegistrationRow(row) {
  return {
    id: row.id,
    tournamentId: row.tournament_id,
    displayName: row.display_name,
    phone: row.phone,
    notes: row.notes,
    answers: JSON.parse(row.answers || '{}'),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

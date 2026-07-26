import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export class LocalD1Database {
  constructor(filePath) {
    this.filePath = filePath;
    this.tournaments = new Map();
    this.registrations = new Map();
  }

  async initialize({ reset = false, backupPath = null } = {}) {
    if (reset) await rm(this.filePath, { force: true });
    await this.#load();
    if (backupPath) {
      const parsed = JSON.parse(await readFile(backupPath, 'utf8'));
      if (parsed?.format !== 'spin-league-backup' || parsed?.version !== 1 || !Array.isArray(parsed.tournaments)) {
        throw new Error('The preload file is not a Spin League backup version 1.');
      }
      this.tournaments.clear();
      for (const tournament of parsed.tournaments) {
        const copy = structuredClone(tournament);
        const revision = Number(copy.revision) || 1;
        delete copy.revision;
        this.tournaments.set(String(copy.id), {
          data: JSON.stringify(copy),
          revision,
          updated_at: new Date().toISOString(),
        });
      }
      this.registrations.clear();
      await this.#save();
    }
  }

  prepare(sql) {
    return new LocalD1Statement(this, normalizeSql(sql));
  }

  async batch(statements) {
    const results = [];
    for (const statement of statements) results.push(await statement.run());
    return results;
  }

  async persist() {
    await this.#save();
  }

  async #load() {
    try {
      const parsed = JSON.parse(await readFile(this.filePath, 'utf8'));
      for (const row of parsed.tournaments || []) this.tournaments.set(String(row.id), row);
      for (const row of parsed.registrations || []) this.registrations.set(String(row.id), row);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }

  async #save() {
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.tmp`;
    const payload = {
      format: 'spin-league-local-d1',
      version: 1,
      updatedAt: new Date().toISOString(),
      tournaments: [...this.tournaments.entries()].map(([id, row]) => ({ id, ...row })),
      registrations: [...this.registrations.values()],
    };
    await writeFile(temporaryPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    await rename(temporaryPath, this.filePath);
  }
}

class LocalD1Statement {
  constructor(database, sql) {
    this.database = database;
    this.sql = sql;
    this.values = [];
  }

  bind(...values) {
    this.values = values;
    return this;
  }

  async all() {
    if (this.sql.includes('FROM registrations')) {
      const tournamentId = String(this.values[0]);
      const results = [...this.database.registrations.values()]
        .filter((row) => row.tournament_id === tournamentId)
        .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
      return { results };
    }
    if (this.sql.startsWith('SELECT data, revision FROM tournaments')) {
      const results = [...this.database.tournaments.values()]
        .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))
        .map((row) => ({ data: row.data, revision: row.revision }));
      return { results };
    }
    throw new Error(`Unsupported local D1 all(): ${this.sql}`);
  }

  async first() {
    if (this.sql.startsWith('SELECT COUNT(*) AS count FROM registrations')) {
      const tournamentId = String(this.values[0]);
      const count = [...this.database.registrations.values()]
        .filter((row) => row.tournament_id === tournamentId && ['pending', 'waitlist'].includes(row.status))
        .length;
      return { count };
    }
    if (this.sql.includes('FROM registrations WHERE id = ?')) {
      return this.database.registrations.get(String(this.values[0])) || null;
    }
    if (this.sql.startsWith('SELECT data, revision FROM tournaments WHERE id = ?')) {
      const row = this.database.tournaments.get(String(this.values[0]));
      return row ? { data: row.data, revision: row.revision } : null;
    }
    throw new Error(`Unsupported local D1 first(): ${this.sql}`);
  }

  async run() {
    const now = new Date().toISOString();
    if (this.sql === 'DELETE FROM tournaments') {
      const changes = this.database.tournaments.size;
      this.database.tournaments.clear();
      await this.database.persist();
      return changed(changes);
    }

    if (this.sql.startsWith('INSERT INTO tournaments')) {
      const [id, data, revision] = this.values;
      this.database.tournaments.set(String(id), { data, revision: Number(revision), updated_at: now });
      await this.database.persist();
      return changed(1);
    }

    if (this.sql.startsWith('UPDATE tournaments SET data = ?')) {
      const [data, revision, id, expectedRevision] = this.values;
      const current = this.database.tournaments.get(String(id));
      if (!current || Number(current.revision) !== Number(expectedRevision)) return changed(0);
      this.database.tournaments.set(String(id), { data, revision: Number(revision), updated_at: now });
      await this.database.persist();
      return changed(1);
    }

    if (this.sql.startsWith('DELETE FROM tournaments WHERE id = ?')) {
      const [id, expectedRevision] = this.values;
      const current = this.database.tournaments.get(String(id));
      if (!current || Number(current.revision) !== Number(expectedRevision)) return changed(0);
      this.database.tournaments.delete(String(id));
      await this.database.persist();
      return changed(1);
    }

    if (this.sql.startsWith('INSERT INTO registrations')) {
      const [id, tournamentId, displayName, phone, notes, answers, dedupeKey] = this.values;
      const duplicate = [...this.database.registrations.values()].some((row) => (
        row.tournament_id === String(tournamentId) && row.dedupe_key === dedupeKey
      ));
      if (duplicate) throw new Error('UNIQUE constraint failed: registrations.tournament_id, registrations.dedupe_key');
      this.database.registrations.set(String(id), {
        id: String(id),
        tournament_id: String(tournamentId),
        display_name: displayName,
        phone,
        notes,
        answers,
        dedupe_key: dedupeKey,
        status: 'pending',
        created_at: now,
        updated_at: now,
      });
      await this.database.persist();
      return changed(1);
    }

    if (this.sql.startsWith('UPDATE registrations SET status = ?')) {
      const [status, id] = this.values;
      const row = this.database.registrations.get(String(id));
      if (!row) return changed(0);
      row.status = status;
      row.updated_at = now;
      await this.database.persist();
      return changed(1);
    }

    if (this.sql.startsWith("UPDATE registrations SET status = 'approved'")) {
      const row = this.database.registrations.get(String(this.values[0]));
      if (!row) return changed(0);
      row.status = 'approved';
      row.updated_at = now;
      await this.database.persist();
      return changed(1);
    }

    throw new Error(`Unsupported local D1 run(): ${this.sql}`);
  }
}

function normalizeSql(sql) {
  return String(sql).replace(/\s+/g, ' ').trim();
}

function changed(changes) {
  return { success: true, meta: { changes } };
}

/** D1 schema 的程式內參考；正式 migration 位於 .openai/drizzle。 */
export const tournamentsSchema = `
CREATE TABLE IF NOT EXISTS tournaments (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)
`;

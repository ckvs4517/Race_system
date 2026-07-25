-- 公開報名獨立保存，避免報名提交與裁判記分共用同一個賽事 revision。
CREATE TABLE IF NOT EXISTS registrations (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  answers TEXT NOT NULL DEFAULT '{}',
  dedupe_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (tournament_id, dedupe_key)
);

CREATE INDEX IF NOT EXISTS registrations_tournament_status_idx
ON registrations (tournament_id, status, created_at);

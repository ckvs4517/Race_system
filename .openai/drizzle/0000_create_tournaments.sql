-- 初始賽事表：data 保存完整 JSON，方便賽制欄位持續演進。
CREATE TABLE IF NOT EXISTS tournaments (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 樂觀鎖版本號：避免多位裁判同時操作時以舊資料覆蓋新賽果。
ALTER TABLE tournaments ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;

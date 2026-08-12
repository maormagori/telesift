CREATE TABLE channels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  identifier_type TEXT NOT NULL CHECK (identifier_type IN ('telegram_id', 'username')),
  identifier_value TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (identifier_type, identifier_value)
);

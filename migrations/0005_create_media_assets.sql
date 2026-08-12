CREATE TABLE media_assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id INTEGER NOT NULL UNIQUE REFERENCES telegram_messages (id) ON DELETE CASCADE,
  file_name TEXT,
  mime_type TEXT,
  size_bytes INTEGER,
  duration_seconds REAL,
  width INTEGER,
  height INTEGER,
  availability TEXT NOT NULL DEFAULT 'unknown' CHECK (availability IN ('available', 'unknown', 'unavailable')),
  last_verified_at INTEGER,
  unavailable_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

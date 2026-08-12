CREATE TABLE telegram_chats (
  telegram_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('channel', 'group', 'user')),
  username TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

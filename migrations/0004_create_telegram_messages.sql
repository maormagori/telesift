CREATE TABLE telegram_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id TEXT NOT NULL REFERENCES telegram_chats (telegram_id) ON DELETE CASCADE,
  telegram_message_id INTEGER NOT NULL,
  text TEXT,
  reply_to_message_id INTEGER,
  media_group_id TEXT,
  source_date INTEGER NOT NULL,
  source_edited_at INTEGER,
  fingerprint TEXT NOT NULL,
  deleted_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (chat_id, telegram_message_id)
);

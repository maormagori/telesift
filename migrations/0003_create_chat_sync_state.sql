CREATE TABLE chat_sync_state (
  chat_id TEXT PRIMARY KEY REFERENCES telegram_chats (telegram_id) ON DELETE CASCADE,
  newest_seen_message_id INTEGER,
  oldest_backfilled_message_id INTEGER,
  backfill_completed_at INTEGER,
  last_rescanned_at INTEGER,
  last_error TEXT,
  last_error_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

import type { DatabaseSync } from "node:sqlite";
import type { ChatSyncState } from "../../modules/ingestion/domain/chat-sync-state.js";
import type { ChatSyncStateRepository } from "../../modules/ingestion/ports/chat-sync-state-repository.js";

interface ChatSyncStateRow {
  chat_id: string;
  newest_seen_message_id: number | null;
  oldest_backfilled_message_id: number | null;
  backfill_completed_at: number | null;
  last_rescanned_at: number | null;
  last_error: string | null;
  last_error_at: number | null;
  created_at: number;
  updated_at: number;
}

function toChatSyncState(row: ChatSyncStateRow): ChatSyncState {
  return {
    chatId: row.chat_id,
    newestSeenMessageId: row.newest_seen_message_id,
    oldestBackfilledMessageId: row.oldest_backfilled_message_id,
    backfillCompletedAt: row.backfill_completed_at,
    lastRescannedAt: row.last_rescanned_at,
    lastError: row.last_error,
    lastErrorAt: row.last_error_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createSqliteChatSyncStateRepository(db: DatabaseSync): ChatSyncStateRepository {
  return {
    async get(chatId) {
      const row = db.prepare("SELECT * FROM chat_sync_state WHERE chat_id = ?").get(chatId) as unknown as
        | ChatSyncStateRow
        | undefined;
      return row ? toChatSyncState(row) : null;
    },

    async advanceIncrementalCursor(chatId, newestSeenMessageId, now) {
      const row = db
        .prepare(
          `INSERT INTO chat_sync_state (chat_id, newest_seen_message_id, created_at, updated_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT (chat_id) DO UPDATE SET
             newest_seen_message_id = COALESCE(MAX(newest_seen_message_id, excluded.newest_seen_message_id), excluded.newest_seen_message_id),
             updated_at = excluded.updated_at
           RETURNING *`,
        )
        .get(chatId, newestSeenMessageId, now, now) as unknown as ChatSyncStateRow | undefined;
      if (!row) throw new Error(`Failed to advance incremental cursor: ${chatId}`);
      return toChatSyncState(row);
    },

    async advanceBackfillCursor(chatId, oldestBackfilledMessageId, now) {
      const row = db
        .prepare(
          `INSERT INTO chat_sync_state (chat_id, oldest_backfilled_message_id, created_at, updated_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT (chat_id) DO UPDATE SET
             oldest_backfilled_message_id = COALESCE(MIN(oldest_backfilled_message_id, excluded.oldest_backfilled_message_id), excluded.oldest_backfilled_message_id),
             updated_at = excluded.updated_at
           RETURNING *`,
        )
        .get(chatId, oldestBackfilledMessageId, now, now) as unknown as ChatSyncStateRow | undefined;
      if (!row) throw new Error(`Failed to advance backfill cursor: ${chatId}`);
      return toChatSyncState(row);
    },

    async markBackfillCompleted(chatId, completedAt) {
      const row = db
        .prepare(
          `INSERT INTO chat_sync_state (chat_id, backfill_completed_at, created_at, updated_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT (chat_id) DO UPDATE SET backfill_completed_at = excluded.backfill_completed_at, updated_at = excluded.updated_at
           RETURNING *`,
        )
        .get(chatId, completedAt, completedAt, completedAt) as unknown as ChatSyncStateRow | undefined;
      if (!row) throw new Error(`Failed to mark backfill completed: ${chatId}`);
      return toChatSyncState(row);
    },

    async recordRescan(chatId, rescannedAt) {
      const row = db
        .prepare(
          `INSERT INTO chat_sync_state (chat_id, last_rescanned_at, created_at, updated_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT (chat_id) DO UPDATE SET last_rescanned_at = excluded.last_rescanned_at, updated_at = excluded.updated_at
           RETURNING *`,
        )
        .get(chatId, rescannedAt, rescannedAt, rescannedAt) as unknown as ChatSyncStateRow | undefined;
      if (!row) throw new Error(`Failed to record rescan: ${chatId}`);
      return toChatSyncState(row);
    },

    async recordError(chatId, error, at) {
      const row = db
        .prepare(
          `INSERT INTO chat_sync_state (chat_id, last_error, last_error_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT (chat_id) DO UPDATE SET last_error = excluded.last_error, last_error_at = excluded.last_error_at, updated_at = excluded.updated_at
           RETURNING *`,
        )
        .get(chatId, error, at, at, at) as unknown as ChatSyncStateRow | undefined;
      if (!row) throw new Error(`Failed to record sync error: ${chatId}`);
      return toChatSyncState(row);
    },
  };
}

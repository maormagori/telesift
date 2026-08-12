import { sql, type Kysely, type Selectable } from "kysely";
import type { ChatSyncState } from "../../modules/ingestion/domain/chat-sync-state.js";
import type { ChatSyncStateRepository } from "../../modules/ingestion/ports/chat-sync-state-repository.js";
import type { ChatSyncStateTable, DB } from "./schema.js";

function toChatSyncState(row: Selectable<ChatSyncStateTable>): ChatSyncState {
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

export function createSqliteChatSyncStateRepository(db: Kysely<DB>): ChatSyncStateRepository {
  return {
    async get(chatId) {
      const row = await db
        .selectFrom("chat_sync_state")
        .selectAll()
        .where("chat_id", "=", chatId)
        .executeTakeFirst();
      return row ? toChatSyncState(row) : null;
    },

    async advanceIncrementalCursor(chatId, newestSeenMessageId, now) {
      const result = await sql<Selectable<ChatSyncStateTable>>`
        INSERT INTO chat_sync_state (chat_id, newest_seen_message_id, created_at, updated_at)
        VALUES (${chatId}, ${newestSeenMessageId}, ${now}, ${now})
        ON CONFLICT (chat_id) DO UPDATE SET
          newest_seen_message_id = COALESCE(MAX(newest_seen_message_id, excluded.newest_seen_message_id), excluded.newest_seen_message_id),
          updated_at = excluded.updated_at
        RETURNING *
      `.execute(db);
      const row = result.rows[0];
      if (!row) throw new Error(`Failed to advance incremental cursor: ${chatId}`);
      return toChatSyncState(row);
    },

    async advanceBackfillCursor(chatId, oldestBackfilledMessageId, now) {
      const result = await sql<Selectable<ChatSyncStateTable>>`
        INSERT INTO chat_sync_state (chat_id, oldest_backfilled_message_id, created_at, updated_at)
        VALUES (${chatId}, ${oldestBackfilledMessageId}, ${now}, ${now})
        ON CONFLICT (chat_id) DO UPDATE SET
          oldest_backfilled_message_id = COALESCE(MIN(oldest_backfilled_message_id, excluded.oldest_backfilled_message_id), excluded.oldest_backfilled_message_id),
          updated_at = excluded.updated_at
        RETURNING *
      `.execute(db);
      const row = result.rows[0];
      if (!row) throw new Error(`Failed to advance backfill cursor: ${chatId}`);
      return toChatSyncState(row);
    },

    async markBackfillCompleted(chatId, completedAt) {
      const row = await db
        .insertInto("chat_sync_state")
        .values({ chat_id: chatId, backfill_completed_at: completedAt, created_at: completedAt, updated_at: completedAt })
        .onConflict((oc) =>
          oc.column("chat_id").doUpdateSet((eb) => ({
            backfill_completed_at: eb.ref("excluded.backfill_completed_at"),
            updated_at: eb.ref("excluded.updated_at"),
          })),
        )
        .returningAll()
        .executeTakeFirst();
      if (!row) throw new Error(`Failed to mark backfill completed: ${chatId}`);
      return toChatSyncState(row);
    },

    async recordRescan(chatId, rescannedAt) {
      const row = await db
        .insertInto("chat_sync_state")
        .values({ chat_id: chatId, last_rescanned_at: rescannedAt, created_at: rescannedAt, updated_at: rescannedAt })
        .onConflict((oc) =>
          oc.column("chat_id").doUpdateSet((eb) => ({
            last_rescanned_at: eb.ref("excluded.last_rescanned_at"),
            updated_at: eb.ref("excluded.updated_at"),
          })),
        )
        .returningAll()
        .executeTakeFirst();
      if (!row) throw new Error(`Failed to record rescan: ${chatId}`);
      return toChatSyncState(row);
    },

    async recordError(chatId, error, at) {
      const row = await db
        .insertInto("chat_sync_state")
        .values({ chat_id: chatId, last_error: error, last_error_at: at, created_at: at, updated_at: at })
        .onConflict((oc) =>
          oc.column("chat_id").doUpdateSet((eb) => ({
            last_error: eb.ref("excluded.last_error"),
            last_error_at: eb.ref("excluded.last_error_at"),
            updated_at: eb.ref("excluded.updated_at"),
          })),
        )
        .returningAll()
        .executeTakeFirst();
      if (!row) throw new Error(`Failed to record sync error: ${chatId}`);
      return toChatSyncState(row);
    },
  };
}

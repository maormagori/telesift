import type { Kysely, Selectable } from "kysely";
import type { TelegramChat } from "../../modules/ingestion/domain/telegram-chat.js";
import type {
  TelegramChatRepository,
  UpsertTelegramChatInput,
} from "../../modules/ingestion/ports/telegram-chat-repository.js";
import type { DB, TelegramChatsTable } from "./schema.js";

function toTelegramChat(row: Selectable<TelegramChatsTable>): TelegramChat {
  return {
    telegramId: row.telegram_id,
    title: row.title,
    type: row.type,
    username: row.username,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createSqliteTelegramChatRepository(db: Kysely<DB>): TelegramChatRepository {
  return {
    async upsert(input: UpsertTelegramChatInput) {
      const row = await db
        .insertInto("telegram_chats")
        .values({
          telegram_id: input.telegramId,
          title: input.title,
          type: input.type,
          username: input.username,
          created_at: input.now,
          updated_at: input.now,
        })
        .onConflict((oc) =>
          oc.column("telegram_id").doUpdateSet((eb) => ({
            title: eb.ref("excluded.title"),
            type: eb.ref("excluded.type"),
            username: eb.ref("excluded.username"),
            updated_at: eb.ref("excluded.updated_at"),
          })),
        )
        .returningAll()
        .executeTakeFirst();
      if (!row) throw new Error(`Failed to upsert telegram chat: ${input.telegramId}`);
      return toTelegramChat(row);
    },

    async findByTelegramId(telegramId) {
      const row = await db
        .selectFrom("telegram_chats")
        .selectAll()
        .where("telegram_id", "=", telegramId)
        .executeTakeFirst();
      return row ? toTelegramChat(row) : null;
    },

    async list() {
      const rows = await db.selectFrom("telegram_chats").selectAll().orderBy("telegram_id").execute();
      return rows.map(toTelegramChat);
    },
  };
}

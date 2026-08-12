import type { DatabaseSync } from "node:sqlite";
import type { TelegramChat, TelegramChatType } from "../../modules/ingestion/domain/telegram-chat.js";
import type {
  TelegramChatRepository,
  UpsertTelegramChatInput,
} from "../../modules/ingestion/ports/telegram-chat-repository.js";

interface TelegramChatRow {
  telegram_id: string;
  title: string;
  type: TelegramChatType;
  username: string | null;
  created_at: number;
  updated_at: number;
}

function toTelegramChat(row: TelegramChatRow): TelegramChat {
  return {
    telegramId: row.telegram_id,
    title: row.title,
    type: row.type,
    username: row.username,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createSqliteTelegramChatRepository(db: DatabaseSync): TelegramChatRepository {
  return {
    async upsert(input: UpsertTelegramChatInput) {
      const row = db
        .prepare(
          `INSERT INTO telegram_chats (telegram_id, title, type, username, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT (telegram_id) DO UPDATE SET
             title = excluded.title,
             type = excluded.type,
             username = excluded.username,
             updated_at = excluded.updated_at
           RETURNING *`,
        )
        .get(input.telegramId, input.title, input.type, input.username, input.now, input.now) as unknown as
        | TelegramChatRow
        | undefined;
      if (!row) throw new Error(`Failed to upsert telegram chat: ${input.telegramId}`);
      return toTelegramChat(row);
    },

    async findByTelegramId(telegramId) {
      const row = db.prepare("SELECT * FROM telegram_chats WHERE telegram_id = ?").get(telegramId) as unknown as
        | TelegramChatRow
        | undefined;
      return row ? toTelegramChat(row) : null;
    },

    async list() {
      const rows = db.prepare("SELECT * FROM telegram_chats ORDER BY telegram_id").all() as unknown as
        TelegramChatRow[];
      return rows.map(toTelegramChat);
    },
  };
}

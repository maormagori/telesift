import type { TelegramChat, TelegramChatType } from "../domain/telegram-chat.js";

export interface UpsertTelegramChatInput {
  telegramId: string;
  title: string;
  type: TelegramChatType;
  username: string | null;
  now: number;
}

export interface TelegramChatRepository {
  /** Idempotent: updates title/type/username in place when the telegramId already exists. */
  upsert(input: UpsertTelegramChatInput): Promise<TelegramChat>;
  findByTelegramId(telegramId: string): Promise<TelegramChat | null>;
  list(): Promise<TelegramChat[]>;
}

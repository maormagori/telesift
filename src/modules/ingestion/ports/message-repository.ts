import type { TelegramMessage, UpsertMessageInput, UpsertMessageResult } from "../domain/telegram-message.js";

export interface MessageRepository {
  /**
   * One transaction: upserts telegram_messages (+ media_assets when input.media is present).
   * Enqueues a media_processing_jobs row only when the content fingerprint changed and media is present.
   */
  upsertMessage(input: UpsertMessageInput): Promise<UpsertMessageResult>;
  findByChatAndTelegramId(chatId: string, telegramMessageId: number): Promise<TelegramMessage | null>;
  markDeleted(chatId: string, telegramMessageId: number, deletedAt: number): Promise<TelegramMessage>;
}

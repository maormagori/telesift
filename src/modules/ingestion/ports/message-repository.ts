import type { TelegramMessage, UpsertMessageInput, UpsertMessageResult } from "../domain/telegram-message.js";

export interface MessageRepository {
  /**
   * One transaction: upserts telegram_messages (+ media_assets when input.media is present).
   * Enqueues a media_processing_jobs row only when the content fingerprint changed and media is present.
   */
  upsertMessage(input: UpsertMessageInput): Promise<UpsertMessageResult>;
  findByChatAndTelegramId(chatId: string, telegramMessageId: number): Promise<TelegramMessage | null>;
  /** Looks up a message by its internal id rather than (chatId, telegramMessageId). */
  findById(messageId: number): Promise<TelegramMessage | null>;
  markDeleted(chatId: string, telegramMessageId: number, deletedAt: number): Promise<TelegramMessage>;
  /** Non-deleted message ids for the chat, newest first, capped at `limit`. */
  listRecentMessageIds(chatId: string, limit: number): Promise<number[]>;
  /** Non-deleted messages strictly before `beforeTelegramMessageId` in the chat, oldest-of-the-window first, capped at `limit`. */
  listPrecedingMessages(chatId: string, beforeTelegramMessageId: number, limit: number): Promise<TelegramMessage[]>;
  /** Non-deleted messages sharing `mediaGroupId` in the chat, in telegram_message_id order. */
  listByMediaGroup(chatId: string, mediaGroupId: string): Promise<TelegramMessage[]>;
}

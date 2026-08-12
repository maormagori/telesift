import type { DatabaseSync } from "node:sqlite";
import type { MediaAsset, MediaAvailability } from "../../modules/ingestion/domain/media-asset.js";
import { computeMessageFingerprint } from "../../modules/ingestion/domain/message-fingerprint.js";
import { TelegramMessageNotFoundError, type TelegramMessage } from "../../modules/ingestion/domain/telegram-message.js";
import type { MessageRepository } from "../../modules/ingestion/ports/message-repository.js";
import { withTransaction } from "./transaction.js";

interface TelegramMessageRow {
  id: number;
  chat_id: string;
  telegram_message_id: number;
  text: string | null;
  reply_to_message_id: number | null;
  media_group_id: string | null;
  source_date: number;
  source_edited_at: number | null;
  fingerprint: string;
  deleted_at: number | null;
  created_at: number;
  updated_at: number;
}

interface MediaAssetRow {
  id: number;
  message_id: number;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  duration_seconds: number | null;
  width: number | null;
  height: number | null;
  availability: MediaAvailability;
  last_verified_at: number | null;
  unavailable_at: number | null;
  created_at: number;
  updated_at: number;
}

function toTelegramMessage(row: TelegramMessageRow): TelegramMessage {
  return {
    id: row.id,
    chatId: row.chat_id,
    telegramMessageId: row.telegram_message_id,
    text: row.text,
    replyToMessageId: row.reply_to_message_id,
    mediaGroupId: row.media_group_id,
    sourceDate: row.source_date,
    sourceEditedAt: row.source_edited_at,
    fingerprint: row.fingerprint,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toMediaAsset(row: MediaAssetRow): MediaAsset {
  return {
    id: row.id,
    messageId: row.message_id,
    fileName: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    durationSeconds: row.duration_seconds,
    width: row.width,
    height: row.height,
    availability: row.availability,
    lastVerifiedAt: row.last_verified_at,
    unavailableAt: row.unavailable_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createSqliteMessageRepository(db: DatabaseSync): MessageRepository {
  function findRow(chatId: string, telegramMessageId: number): TelegramMessageRow | undefined {
    return db
      .prepare("SELECT * FROM telegram_messages WHERE chat_id = ? AND telegram_message_id = ?")
      .get(chatId, telegramMessageId) as unknown as TelegramMessageRow | undefined;
  }

  return {
    async upsertMessage(input) {
      return withTransaction(db, () => {
        const existing = findRow(input.chatId, input.telegramMessageId);
        const fingerprint = computeMessageFingerprint({
          text: input.text,
          replyToMessageId: input.replyToMessageId,
          mediaGroupId: input.mediaGroupId,
          sourceEditedAt: input.sourceEditedAt,
          media: input.media,
        });
        const contentChanged = !existing || existing.fingerprint !== fingerprint;

        const messageRow = db
          .prepare(
            `INSERT INTO telegram_messages
               (chat_id, telegram_message_id, text, reply_to_message_id, media_group_id, source_date, source_edited_at, fingerprint, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT (chat_id, telegram_message_id) DO UPDATE SET
               text = excluded.text,
               reply_to_message_id = excluded.reply_to_message_id,
               media_group_id = excluded.media_group_id,
               source_date = excluded.source_date,
               source_edited_at = excluded.source_edited_at,
               fingerprint = excluded.fingerprint,
               updated_at = excluded.updated_at
             RETURNING *`,
          )
          .get(
            input.chatId,
            input.telegramMessageId,
            input.text,
            input.replyToMessageId,
            input.mediaGroupId,
            input.sourceDate,
            input.sourceEditedAt,
            fingerprint,
            input.now,
            input.now,
          ) as unknown as TelegramMessageRow | undefined;
        if (!messageRow) throw new Error(`Failed to upsert message: ${input.chatId}/${input.telegramMessageId}`);
        const message = toTelegramMessage(messageRow);

        let mediaAsset: MediaAsset | null = null;
        if (input.media) {
          const mediaRow = db
            .prepare(
              `INSERT INTO media_assets
                 (message_id, file_name, mime_type, size_bytes, duration_seconds, width, height, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT (message_id) DO UPDATE SET
                 file_name = excluded.file_name,
                 mime_type = excluded.mime_type,
                 size_bytes = excluded.size_bytes,
                 duration_seconds = excluded.duration_seconds,
                 width = excluded.width,
                 height = excluded.height,
                 updated_at = excluded.updated_at
               RETURNING *`,
            )
            .get(
              message.id,
              input.media.fileName,
              input.media.mimeType,
              input.media.sizeBytes,
              input.media.durationSeconds,
              input.media.width,
              input.media.height,
              input.now,
              input.now,
            ) as unknown as MediaAssetRow | undefined;
          if (!mediaRow) throw new Error(`Failed to upsert media asset for message: ${message.id}`);
          mediaAsset = toMediaAsset(mediaRow);
        }

        let jobEnqueued = false;
        if (contentChanged && mediaAsset) {
          const jobRow = db
            .prepare(
              `INSERT INTO media_processing_jobs (media_asset_id, input_fingerprint, available_at, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?)
               ON CONFLICT (media_asset_id, input_fingerprint) DO NOTHING
               RETURNING id`,
            )
            .get(mediaAsset.id, fingerprint, input.now, input.now, input.now);
          jobEnqueued = jobRow !== undefined;
        }

        return { message, mediaAsset, contentChanged, jobEnqueued };
      });
    },

    async findByChatAndTelegramId(chatId, telegramMessageId) {
      const row = findRow(chatId, telegramMessageId);
      return row ? toTelegramMessage(row) : null;
    },

    async markDeleted(chatId, telegramMessageId, deletedAt) {
      const result = db
        .prepare("UPDATE telegram_messages SET deleted_at = ?, updated_at = ? WHERE chat_id = ? AND telegram_message_id = ?")
        .run(deletedAt, deletedAt, chatId, telegramMessageId);
      if (result.changes === 0) throw new TelegramMessageNotFoundError(chatId, telegramMessageId);
      const row = findRow(chatId, telegramMessageId);
      if (!row) throw new TelegramMessageNotFoundError(chatId, telegramMessageId);
      return toTelegramMessage(row);
    },
  };
}

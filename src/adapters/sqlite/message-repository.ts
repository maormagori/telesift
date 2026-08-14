import type { Kysely, Selectable, Transaction } from "kysely";
import type { MediaAsset } from "../../modules/ingestion/domain/media-asset.js";
import { computeMessageFingerprint } from "../../modules/ingestion/domain/message-fingerprint.js";
import { TelegramMessageNotFoundError, type TelegramMessage } from "../../modules/ingestion/domain/telegram-message.js";
import type { MessageRepository } from "../../modules/ingestion/ports/message-repository.js";
import type { DB, MediaAssetsTable, TelegramMessagesTable } from "./schema.js";

function toTelegramMessage(row: Selectable<TelegramMessagesTable>): TelegramMessage {
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

function toMediaAsset(row: Selectable<MediaAssetsTable>): MediaAsset {
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

export function createSqliteMessageRepository(db: Kysely<DB>): MessageRepository {
  function findRow(executor: Kysely<DB> | Transaction<DB>, chatId: string, telegramMessageId: number) {
    return executor
      .selectFrom("telegram_messages")
      .selectAll()
      .where("chat_id", "=", chatId)
      .where("telegram_message_id", "=", telegramMessageId)
      .executeTakeFirst();
  }

  return {
    async upsertMessage(input) {
      return db.transaction().execute(async (trx) => {
        const existing = await findRow(trx, input.chatId, input.telegramMessageId);
        const fingerprint = computeMessageFingerprint({
          text: input.text,
          replyToMessageId: input.replyToMessageId,
          mediaGroupId: input.mediaGroupId,
          sourceEditedAt: input.sourceEditedAt,
          media: input.media,
        });
        const contentChanged = !existing || existing.fingerprint !== fingerprint;

        const messageRow = await trx
          .insertInto("telegram_messages")
          .values({
            chat_id: input.chatId,
            telegram_message_id: input.telegramMessageId,
            text: input.text,
            reply_to_message_id: input.replyToMessageId,
            media_group_id: input.mediaGroupId,
            source_date: input.sourceDate,
            source_edited_at: input.sourceEditedAt,
            fingerprint,
            created_at: input.now,
            updated_at: input.now,
          })
          .onConflict((oc) =>
            oc.columns(["chat_id", "telegram_message_id"]).doUpdateSet((eb) => ({
              text: eb.ref("excluded.text"),
              reply_to_message_id: eb.ref("excluded.reply_to_message_id"),
              media_group_id: eb.ref("excluded.media_group_id"),
              source_date: eb.ref("excluded.source_date"),
              source_edited_at: eb.ref("excluded.source_edited_at"),
              fingerprint: eb.ref("excluded.fingerprint"),
              updated_at: eb.ref("excluded.updated_at"),
            })),
          )
          .returningAll()
          .executeTakeFirst();
        if (!messageRow) throw new Error(`Failed to upsert message: ${input.chatId}/${input.telegramMessageId}`);
        const message = toTelegramMessage(messageRow);

        let mediaAsset: MediaAsset | null = null;
        if (input.media) {
          const mediaRow = await trx
            .insertInto("media_assets")
            .values({
              message_id: message.id,
              file_name: input.media.fileName,
              mime_type: input.media.mimeType,
              size_bytes: input.media.sizeBytes,
              duration_seconds: input.media.durationSeconds,
              width: input.media.width,
              height: input.media.height,
              created_at: input.now,
              updated_at: input.now,
            })
            .onConflict((oc) =>
              oc.column("message_id").doUpdateSet((eb) => ({
                file_name: eb.ref("excluded.file_name"),
                mime_type: eb.ref("excluded.mime_type"),
                size_bytes: eb.ref("excluded.size_bytes"),
                duration_seconds: eb.ref("excluded.duration_seconds"),
                width: eb.ref("excluded.width"),
                height: eb.ref("excluded.height"),
                updated_at: eb.ref("excluded.updated_at"),
              })),
            )
            .returningAll()
            .executeTakeFirst();
          if (!mediaRow) throw new Error(`Failed to upsert media asset for message: ${message.id}`);
          mediaAsset = toMediaAsset(mediaRow);
        }

        let jobEnqueued = false;
        if (contentChanged && mediaAsset) {
          const jobRow = await trx
            .insertInto("media_processing_jobs")
            .values({
              media_asset_id: mediaAsset.id,
              input_fingerprint: fingerprint,
              available_at: input.now,
              created_at: input.now,
              updated_at: input.now,
            })
            .onConflict((oc) => oc.columns(["media_asset_id", "input_fingerprint"]).doNothing())
            .returning("id")
            .executeTakeFirst();
          jobEnqueued = jobRow !== undefined;
        }

        return { message, mediaAsset, contentChanged, jobEnqueued };
      });
    },

    async findByChatAndTelegramId(chatId, telegramMessageId) {
      const row = await findRow(db, chatId, telegramMessageId);
      return row ? toTelegramMessage(row) : null;
    },

    async markDeleted(chatId, telegramMessageId, deletedAt) {
      const result = await db
        .updateTable("telegram_messages")
        .set({ deleted_at: deletedAt, updated_at: deletedAt })
        .where("chat_id", "=", chatId)
        .where("telegram_message_id", "=", telegramMessageId)
        .executeTakeFirst();
      if (result.numUpdatedRows === 0n) throw new TelegramMessageNotFoundError(chatId, telegramMessageId);
      const row = await findRow(db, chatId, telegramMessageId);
      if (!row) throw new TelegramMessageNotFoundError(chatId, telegramMessageId);
      return toTelegramMessage(row);
    },

    async listRecentMessageIds(chatId, limit) {
      const rows = await db
        .selectFrom("telegram_messages")
        .select("telegram_message_id")
        .where("chat_id", "=", chatId)
        .where("deleted_at", "is", null)
        .orderBy("telegram_message_id", "desc")
        .limit(limit)
        .execute();
      return rows.map((row) => row.telegram_message_id);
    },
  };
}

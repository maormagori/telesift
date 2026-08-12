import type { MediaAsset, MediaAssetInput } from "./media-asset.js";

export interface TelegramMessage {
  id: number;
  chatId: string;
  telegramMessageId: number;
  text: string | null;
  replyToMessageId: number | null;
  mediaGroupId: string | null;
  sourceDate: number;
  sourceEditedAt: number | null;
  fingerprint: string;
  deletedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface UpsertMessageInput {
  chatId: string;
  telegramMessageId: number;
  text: string | null;
  replyToMessageId: number | null;
  mediaGroupId: string | null;
  /** Epoch milliseconds. Telegram's raw MTProto `date` is Unix seconds — convert (×1000) before calling. */
  sourceDate: number;
  /** Epoch milliseconds, same conversion as sourceDate. */
  sourceEditedAt: number | null;
  media: MediaAssetInput | null;
  now: number;
}

export interface UpsertMessageResult {
  message: TelegramMessage;
  mediaAsset: MediaAsset | null;
  contentChanged: boolean;
  jobEnqueued: boolean;
}

export class TelegramMessageNotFoundError extends Error {
  constructor(
    public readonly chatId: string,
    public readonly telegramMessageId: number,
  ) {
    super(`Telegram message not found: chatId=${chatId} telegramMessageId=${telegramMessageId}`);
    this.name = "TelegramMessageNotFoundError";
  }
}

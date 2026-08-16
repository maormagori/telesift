import { describe, expect, it } from "vitest";
import type { MediaAsset } from "../domain/media-asset.js";
import type { TelegramMessage } from "../domain/telegram-message.js";
import type { MediaAssetRepository } from "../ports/media-asset-repository.js";
import type { MessageRepository } from "../ports/message-repository.js";
import { createMessageInspectionUseCases } from "./message-inspection.js";

function message(overrides: Partial<TelegramMessage> = {}): TelegramMessage {
  return {
    id: 1,
    chatId: "chat-1",
    telegramMessageId: 1,
    text: "hello",
    replyToMessageId: null,
    mediaGroupId: null,
    sourceDate: 1000,
    sourceEditedAt: null,
    fingerprint: "fp",
    deletedAt: null,
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

function media(overrides: Partial<MediaAsset> = {}): MediaAsset {
  return {
    id: 1,
    messageId: 1,
    fileName: "video.mp4",
    mimeType: "video/mp4",
    sizeBytes: 100,
    durationSeconds: 10,
    width: 1920,
    height: 1080,
    availability: "available",
    lastVerifiedAt: null,
    unavailableAt: null,
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

describe("message inspection use-cases", () => {
  it("pairs each message with its local media metadata", async () => {
    const withMedia = message({ id: 1, telegramMessageId: 1 });
    const withoutMedia = message({ id: 2, telegramMessageId: 2, text: "no media here" });
    const messageRepo: MessageRepository = {
      upsertMessage: () => {
        throw new Error("not used");
      },
      findByChatAndTelegramId: async () => null,
      findById: async () => null,
      markDeleted: () => {
        throw new Error("not used");
      },
      listRecentMessageIds: async () => [],
      listPrecedingMessages: async () => [],
      listByMediaGroup: async () => [],
      listMessagesPage: async () => [withMedia, withoutMedia],
    };
    const mediaAssetRepo: MediaAssetRepository = {
      findById: async () => null,
      findByMessageId: async (messageId) => (messageId === 1 ? media({ messageId: 1 }) : null),
    };
    const useCases = createMessageInspectionUseCases({ messageRepo, mediaAssetRepo });

    const page = await useCases.listMessagesPage("chat-1", { beforeTelegramMessageId: null, limit: 10 });

    expect(page).toEqual([
      { message: withMedia, media: media({ messageId: 1 }) },
      { message: withoutMedia, media: null },
    ]);
  });
});

import { describe, expect, it } from "vitest";
import type { MediaAsset } from "../../ingestion/domain/media-asset.js";
import type { TelegramMessage } from "../../ingestion/domain/telegram-message.js";
import type { MediaAssetRepository } from "../../ingestion/ports/media-asset-repository.js";
import type { MessageRepository } from "../../ingestion/ports/message-repository.js";
import type { ContextGroup } from "../domain/context-group.js";
import type { ContextGroupRepository, ContextGroupWithMembers } from "../ports/context-group-repository.js";
import { createBuildOrRefreshContextGroup, MediaAssetNotFoundError } from "./build-or-refresh-context-group.js";

function message(overrides: Partial<TelegramMessage>): TelegramMessage {
  return {
    id: 1,
    chatId: "-100123",
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

function mediaAsset(overrides: Partial<MediaAsset> = {}): MediaAsset {
  return {
    id: 1,
    messageId: 1,
    fileName: "video.mp4",
    mimeType: "video/mp4",
    sizeBytes: 100,
    durationSeconds: 10,
    width: 1920,
    height: 1080,
    availability: "unknown",
    lastVerifiedAt: null,
    unavailableAt: null,
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

function fakeContextGroupRepo(): ContextGroupRepository & { upserts: number } {
  const state = { upserts: 0 };
  return {
    get upserts() {
      return state.upserts;
    },
    async upsert(input) {
      state.upserts += 1;
      const group: ContextGroup = {
        id: 1,
        mediaAssetId: input.mediaAssetId,
        status: input.status,
        inputFingerprint: input.inputFingerprint,
        quietPeriodDeadline: input.quietPeriodDeadline,
        createdAt: input.now,
        updatedAt: input.now,
      };
      return { group, members: input.members };
    },
    async getByMediaAssetId(): Promise<ContextGroupWithMembers | null> {
      return null;
    },
  };
}

describe("buildOrRefreshContextGroup", () => {
  it("closes the group immediately for a self-contained target with no reply/media-group", async () => {
    const target = message({ id: 10, telegramMessageId: 10 });
    const messageRepo: MessageRepository = {
      upsertMessage: () => {
        throw new Error("not used");
      },
      findByChatAndTelegramId: async () => null,
      findById: async (id) => (id === 10 ? target : null),
      markDeleted: () => {
        throw new Error("not used");
      },
      listRecentMessageIds: async () => [],
      listPrecedingMessages: async () => [],
      listByMediaGroup: async () => [],
    };
    const mediaAssetRepo: MediaAssetRepository = { findById: async () => mediaAsset({ messageId: 10 }) };
    const contextGroupRepo = fakeContextGroupRepo();

    const buildOrRefresh = createBuildOrRefreshContextGroup({
      mediaAssetRepo,
      messageRepo,
      contextGroupRepo,
      precedingWindowSize: 2,
      quietPeriodMs: 10_000,
    });

    const result = await buildOrRefresh(1, 5000);

    expect(result.ready).toBe(true);
    expect(result.contextGroup.group.status).toBe("closed");
    expect(result.contextGroup.members).toEqual([{ messageId: 10, role: "target", relativeOrder: 0 }]);
  });

  it("stays open while a media group is within its quiet period", async () => {
    const target = message({ id: 10, telegramMessageId: 10, mediaGroupId: "album-1", createdAt: 4900 });
    const messageRepo: MessageRepository = {
      upsertMessage: () => {
        throw new Error("not used");
      },
      findByChatAndTelegramId: async () => null,
      findById: async (id) => (id === 10 ? target : null),
      markDeleted: () => {
        throw new Error("not used");
      },
      listRecentMessageIds: async () => [],
      listPrecedingMessages: async () => [],
      listByMediaGroup: async () => [target],
    };
    const mediaAssetRepo: MediaAssetRepository = { findById: async () => mediaAsset({ messageId: 10 }) };
    const contextGroupRepo = fakeContextGroupRepo();

    const buildOrRefresh = createBuildOrRefreshContextGroup({
      mediaAssetRepo,
      messageRepo,
      contextGroupRepo,
      precedingWindowSize: 2,
      quietPeriodMs: 10_000,
    });

    const result = await buildOrRefresh(1, 5000);

    expect(result.ready).toBe(false);
    expect(result.contextGroup.group.status).toBe("open");
    expect(result.contextGroup.group.quietPeriodDeadline).toBe(4900 + 10_000);
  });

  it("closes a media group once the quiet period has elapsed", async () => {
    const target = message({ id: 10, telegramMessageId: 10, mediaGroupId: "album-1", createdAt: 1000 });
    const messageRepo: MessageRepository = {
      upsertMessage: () => {
        throw new Error("not used");
      },
      findByChatAndTelegramId: async () => null,
      findById: async (id) => (id === 10 ? target : null),
      markDeleted: () => {
        throw new Error("not used");
      },
      listRecentMessageIds: async () => [],
      listPrecedingMessages: async () => [],
      listByMediaGroup: async () => [target],
    };
    const mediaAssetRepo: MediaAssetRepository = { findById: async () => mediaAsset({ messageId: 10 }) };
    const contextGroupRepo = fakeContextGroupRepo();

    const buildOrRefresh = createBuildOrRefreshContextGroup({
      mediaAssetRepo,
      messageRepo,
      contextGroupRepo,
      precedingWindowSize: 2,
      quietPeriodMs: 10_000,
    });

    const result = await buildOrRefresh(1, 50_000);

    expect(result.ready).toBe(true);
    expect(result.contextGroup.group.status).toBe("closed");
  });

  it("includes the reply target and preceding messages when present", async () => {
    const replyTarget = message({ id: 5, telegramMessageId: 5 });
    const preceding = message({ id: 9, telegramMessageId: 9 });
    const target = message({ id: 10, telegramMessageId: 10, replyToMessageId: 5 });
    const messageRepo: MessageRepository = {
      upsertMessage: () => {
        throw new Error("not used");
      },
      findByChatAndTelegramId: async (_chatId, telegramMessageId) => (telegramMessageId === 5 ? replyTarget : null),
      findById: async (id) => (id === 10 ? target : null),
      markDeleted: () => {
        throw new Error("not used");
      },
      listRecentMessageIds: async () => [],
      listPrecedingMessages: async () => [preceding],
      listByMediaGroup: async () => [],
    };
    const mediaAssetRepo: MediaAssetRepository = { findById: async () => mediaAsset({ messageId: 10 }) };
    const contextGroupRepo = fakeContextGroupRepo();

    const buildOrRefresh = createBuildOrRefreshContextGroup({
      mediaAssetRepo,
      messageRepo,
      contextGroupRepo,
      precedingWindowSize: 2,
      quietPeriodMs: 10_000,
    });

    const result = await buildOrRefresh(1, 5000);

    const roles = result.contextGroup.members.map((m) => [m.messageId, m.role]);
    expect(roles).toEqual(
      expect.arrayContaining([
        [10, "target"],
        [5, "reply"],
        [9, "preceding"],
      ]),
    );
  });

  it("throws MediaAssetNotFoundError for an unknown media asset", async () => {
    const mediaAssetRepo: MediaAssetRepository = { findById: async () => null };
    const messageRepo = {} as MessageRepository;
    const contextGroupRepo = fakeContextGroupRepo();

    const buildOrRefresh = createBuildOrRefreshContextGroup({
      mediaAssetRepo,
      messageRepo,
      contextGroupRepo,
      precedingWindowSize: 2,
      quietPeriodMs: 10_000,
    });

    await expect(buildOrRefresh(999, 5000)).rejects.toThrow(MediaAssetNotFoundError);
  });
});

import { describe, expect, it } from "vitest";
import type { MediaAsset } from "../../ingestion/domain/media-asset.js";
import type { TelegramMessage } from "../../ingestion/domain/telegram-message.js";
import type { MediaAssetRepository } from "../../ingestion/ports/media-asset-repository.js";
import type { MessageRepository } from "../../ingestion/ports/message-repository.js";
import type { Release } from "../../catalog/domain/release.js";
import type { ReleaseRevision } from "../../catalog/domain/release-revision.js";
import type { ReleaseRepository } from "../../catalog/ports/release-repository.js";
import type { ReleaseRevisionRepository } from "../../catalog/ports/release-revision-repository.js";
import { createReviewQueueUseCases } from "./review-queue.js";
import { ReleaseNotFoundError } from "./review-use-cases.js";

function release(overrides: Partial<Release> = {}): Release {
  return {
    id: 1,
    mediaAssetId: 1,
    seriesId: 1,
    extractionRunId: 1,
    season: 4,
    episode: 3,
    resolution: "1080p",
    source: null,
    codec: null,
    language: "he",
    displayTitle: "Fauda.S04E03.1080p.Telegram",
    reviewState: "pending_review",
    manuallyVerified: false,
    manuallyVerifiedAt: null,
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

function fakeReleaseRepo(releases: Release[]): ReleaseRepository {
  return {
    async findById(id) {
      return releases.find((r) => r.id === id) ?? null;
    },
    async findByMediaAssetId(mediaAssetId) {
      return releases.find((r) => r.mediaAssetId === mediaAssetId) ?? null;
    },
    async listByReviewState(reviewState, options) {
      return releases
        .filter((r) => r.reviewState === reviewState && (options.afterId === null || r.id > options.afterId))
        .sort((a, b) => a.id - b.id)
        .slice(0, options.limit);
    },
    async create() {
      throw new Error("not used");
    },
    async update() {
      throw new Error("not used");
    },
  };
}

function fakeMediaAssetRepo(assets: MediaAsset[]): MediaAssetRepository {
  return {
    async findById(id) {
      return assets.find((a) => a.id === id) ?? null;
    },
    async findByMessageId(messageId) {
      return assets.find((a) => a.messageId === messageId) ?? null;
    },
    async updateAvailability() {},
  };
}

function fakeMessageRepo(messages: TelegramMessage[]): MessageRepository {
  return {
    upsertMessage: () => {
      throw new Error("not used");
    },
    findByChatAndTelegramId: async () => null,
    findById: async (id) => messages.find((m) => m.id === id) ?? null,
    markDeleted: () => {
      throw new Error("not used");
    },
    listRecentMessageIds: async () => [],
    listPrecedingMessages: async () => [],
    listByMediaGroup: async () => [],
    listMessagesPage: async () => [],
  };
}

function fakeRevisionRepo(revisions: ReleaseRevision[]): ReleaseRevisionRepository {
  return {
    async insert() {
      throw new Error("not used");
    },
    async listByReleaseId(releaseId) {
      return revisions.filter((r) => r.releaseId === releaseId);
    },
  };
}

describe("review queue use cases", () => {
  it("listPendingReview delegates to the repository", async () => {
    const releases = [release({ id: 1 }), release({ id: 2, reviewState: "approved" })];
    const useCases = createReviewQueueUseCases({
      releaseRepo: fakeReleaseRepo(releases),
      releaseRevisionRepo: fakeRevisionRepo([]),
      mediaAssetRepo: fakeMediaAssetRepo([]),
      messageRepo: fakeMessageRepo([]),
    });

    const page = await useCases.listPendingReview({ afterId: null, limit: 10 });

    expect(page.map((r) => r.id)).toEqual([1]);
  });

  it("getReleaseDetail assembles release, source message/media, and revision history", async () => {
    const media: MediaAsset = {
      id: 1,
      messageId: 10,
      fileName: "episode.mp4",
      mimeType: "video/mp4",
      sizeBytes: 100,
      durationSeconds: 60,
      width: 1920,
      height: 1080,
      availability: "available",
      lastVerifiedAt: null,
      unavailableAt: null,
      createdAt: 1000,
      updatedAt: 1000,
    };
    const message: TelegramMessage = {
      id: 10,
      chatId: "-100123",
      telegramMessageId: 5,
      text: "Fauda S04E03",
      replyToMessageId: null,
      mediaGroupId: null,
      sourceDate: 1000,
      sourceEditedAt: null,
      fingerprint: "fp",
      deletedAt: null,
      createdAt: 1000,
      updatedAt: 1000,
    };
    const revision: ReleaseRevision = {
      id: 1,
      releaseId: 1,
      extractionRunId: 1,
      changeSource: "extraction",
      before: {
        seriesId: 1,
        season: 4,
        episode: 2,
        resolution: "1080p",
        source: null,
        codec: null,
        language: "he",
        displayTitle: "Fauda.S04E02.1080p.Telegram",
        reviewState: "pending_review",
        manuallyVerified: false,
        manuallyVerifiedAt: null,
      },
      after: {
        seriesId: 1,
        season: 4,
        episode: 3,
        resolution: "1080p",
        source: null,
        codec: null,
        language: "he",
        displayTitle: "Fauda.S04E03.1080p.Telegram",
        reviewState: "pending_review",
        manuallyVerified: false,
        manuallyVerifiedAt: null,
      },
      actor: "extraction",
      createdAt: 1000,
    };
    const useCases = createReviewQueueUseCases({
      releaseRepo: fakeReleaseRepo([release({ id: 1, mediaAssetId: 1 })]),
      releaseRevisionRepo: fakeRevisionRepo([revision]),
      mediaAssetRepo: fakeMediaAssetRepo([media]),
      messageRepo: fakeMessageRepo([message]),
    });

    const detail = await useCases.getReleaseDetail(1);

    expect(detail.release.id).toBe(1);
    expect(detail.source.media).toEqual(media);
    expect(detail.source.message).toEqual(message);
    expect(detail.revisions).toEqual([revision]);
  });

  it("getReleaseDetail throws ReleaseNotFoundError for an unknown release", async () => {
    const useCases = createReviewQueueUseCases({
      releaseRepo: fakeReleaseRepo([]),
      releaseRevisionRepo: fakeRevisionRepo([]),
      mediaAssetRepo: fakeMediaAssetRepo([]),
      messageRepo: fakeMessageRepo([]),
    });

    await expect(useCases.getReleaseDetail(999)).rejects.toThrow(ReleaseNotFoundError);
  });
});

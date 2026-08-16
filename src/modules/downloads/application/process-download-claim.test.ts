import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import type { Release } from "../../catalog/domain/release.js";
import type { ReleaseRepository } from "../../catalog/ports/release-repository.js";
import type { MediaAsset } from "../../ingestion/domain/media-asset.js";
import type { TelegramMessage } from "../../ingestion/domain/telegram-message.js";
import type { MediaAssetRepository } from "../../ingestion/ports/media-asset-repository.js";
import type { MessageRepository } from "../../ingestion/ports/message-repository.js";
import type { TelegramAccessPort } from "../../telegram-access/ports/telegram-access-port.js";
import type { Download } from "../domain/download.js";
import type { DownloadRepository } from "../ports/download-repository.js";
import type { StagingFilesystemPort } from "../ports/staging-filesystem-port.js";
import { createProcessDownloadClaim } from "./process-download-claim.js";

function download(overrides: Partial<Download> = {}): Download {
  return {
    id: 1,
    releaseId: 10,
    clientHash: "hash",
    desiredState: "queued",
    observedState: "verifying",
    progressBytes: 0,
    totalBytes: null,
    stagingPath: null,
    category: null,
    workerId: "w1",
    leaseExpiresAt: 5000,
    attempts: 1,
    lastError: null,
    lastErrorAt: null,
    completedAt: null,
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

function release(overrides: Partial<Release> = {}): Release {
  return {
    id: 10,
    mediaAssetId: 20,
    seriesId: null,
    extractionRunId: 1,
    season: 1,
    episode: 1,
    resolution: null,
    source: null,
    codec: null,
    language: null,
    displayTitle: "Show.S01E01",
    reviewState: "approved",
    manuallyVerified: false,
    manuallyVerifiedAt: null,
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

function mediaAsset(overrides: Partial<MediaAsset> = {}): MediaAsset {
  return {
    id: 20,
    messageId: 30,
    fileName: "episode.mp4",
    mimeType: "video/mp4",
    sizeBytes: 100,
    durationSeconds: null,
    width: null,
    height: null,
    availability: "unknown",
    lastVerifiedAt: null,
    unavailableAt: null,
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

function message(overrides: Partial<TelegramMessage> = {}): TelegramMessage {
  return {
    id: 30,
    chatId: "-100123",
    telegramMessageId: 5,
    text: null,
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

describe("processDownloadClaim", () => {
  it("cancels immediately when desiredState is canceled, without touching Telegram", async () => {
    const staging: Partial<StagingFilesystemPort> = { deleteFile: vi.fn().mockResolvedValue(undefined) };
    const downloadRepo: Partial<DownloadRepository> = { cancel: vi.fn().mockResolvedValue(true) };
    const telegramAccess: Partial<TelegramAccessPort> = { getMessage: vi.fn(), getMediaStream: vi.fn() };
    const releaseRepo: Partial<ReleaseRepository> = { findById: vi.fn() };

    const process = createProcessDownloadClaim({
      releaseRepo: releaseRepo as ReleaseRepository,
      mediaAssetRepo: {} as MediaAssetRepository,
      messageRepo: {} as MessageRepository,
      telegramAccess: telegramAccess as TelegramAccessPort,
      staging: staging as StagingFilesystemPort,
      downloadRepo: downloadRepo as DownloadRepository,
      progressReportIntervalMs: 5000,
      leaseDurationMs: 60000,
    });

    const claimed = download({ desiredState: "canceled", stagingPath: "/staging/1-file", progressBytes: 40 });
    await process(claimed, "w1", 2000);

    expect(staging.deleteFile).toHaveBeenCalledWith("/staging/1-file");
    expect(downloadRepo.cancel).toHaveBeenCalledWith(1, "w1", 2000);
    expect(telegramAccess.getMessage).not.toHaveBeenCalled();
    expect(releaseRepo.findById).not.toHaveBeenCalled();
  });

  it("pauses immediately when desiredState is paused, without touching Telegram", async () => {
    const downloadRepo: Partial<DownloadRepository> = { pause: vi.fn().mockResolvedValue(true) };
    const telegramAccess: Partial<TelegramAccessPort> = { getMessage: vi.fn() };

    const process = createProcessDownloadClaim({
      releaseRepo: {} as ReleaseRepository,
      mediaAssetRepo: {} as MediaAssetRepository,
      messageRepo: {} as MessageRepository,
      telegramAccess: telegramAccess as TelegramAccessPort,
      staging: {} as StagingFilesystemPort,
      downloadRepo: downloadRepo as DownloadRepository,
      progressReportIntervalMs: 5000,
      leaseDurationMs: 60000,
    });

    const claimed = download({ desiredState: "paused", progressBytes: 40 });
    await process(claimed, "w1", 2000);

    expect(downloadRepo.pause).toHaveBeenCalledWith(1, "w1", 40, 2000);
    expect(telegramAccess.getMessage).not.toHaveBeenCalled();
  });

  it("marks the media asset unavailable and fails the download when grab-time verification finds no media", async () => {
    const downloadRepo: Partial<DownloadRepository> = { fail: vi.fn().mockResolvedValue(true) };
    const mediaAssetRepo: Partial<MediaAssetRepository> = {
      findById: vi.fn().mockResolvedValue(mediaAsset()),
      updateAvailability: vi.fn().mockResolvedValue(undefined),
    };
    const messageRepo: Partial<MessageRepository> = { findById: vi.fn().mockResolvedValue(message()) };
    const releaseRepo: Partial<ReleaseRepository> = { findById: vi.fn().mockResolvedValue(release()) };
    const telegramAccess: Partial<TelegramAccessPort> = {
      getMessage: vi.fn().mockResolvedValue({
        chatId: "-100123",
        messageId: 5,
        date: 1,
        text: null,
        replyToMessageId: null,
        mediaGroupId: null,
        media: null,
      }),
      getMediaStream: vi.fn(),
    };

    const process = createProcessDownloadClaim({
      releaseRepo: releaseRepo as ReleaseRepository,
      mediaAssetRepo: mediaAssetRepo as MediaAssetRepository,
      messageRepo: messageRepo as MessageRepository,
      telegramAccess: telegramAccess as TelegramAccessPort,
      staging: {} as StagingFilesystemPort,
      downloadRepo: downloadRepo as DownloadRepository,
      progressReportIntervalMs: 5000,
      leaseDurationMs: 60000,
    });

    await process(download(), "w1", 2000);

    expect(mediaAssetRepo.updateAvailability).toHaveBeenCalledWith(20, { availability: "unavailable", now: 2000 });
    expect(downloadRepo.fail).toHaveBeenCalledWith(1, "w1", "media_unavailable", 2000);
    expect(telegramAccess.getMediaStream).not.toHaveBeenCalled();
  });

  it("streams to completion on the happy path", async () => {
    const downloadRepo: Partial<DownloadRepository> = {
      complete: vi.fn().mockResolvedValue(true),
      reportProgress: vi.fn().mockResolvedValue("queued"),
    };
    const mediaAssetRepo: Partial<MediaAssetRepository> = {
      findById: vi.fn().mockResolvedValue(mediaAsset()),
      updateAvailability: vi.fn().mockResolvedValue(undefined),
    };
    const messageRepo: Partial<MessageRepository> = { findById: vi.fn().mockResolvedValue(message()) };
    const releaseRepo: Partial<ReleaseRepository> = { findById: vi.fn().mockResolvedValue(release()) };
    const descriptor = {
      fileName: "episode.mp4",
      mimeType: "video/mp4",
      sizeBytes: 100,
      durationSeconds: null,
      width: null,
      height: null,
    };
    const telegramAccess: Partial<TelegramAccessPort> = {
      getMessage: vi.fn().mockResolvedValue({
        chatId: "-100123",
        messageId: 5,
        date: 1,
        text: null,
        replyToMessageId: null,
        mediaGroupId: null,
        media: descriptor,
      }),
      getMediaStream: vi.fn().mockResolvedValue({ descriptor, stream: Readable.from([Buffer.from("x")]) }),
    };
    const staging: Partial<StagingFilesystemPort> = {
      buildPath: vi.fn().mockReturnValue("/staging/1-episode.mp4"),
      existingBytes: vi.fn().mockResolvedValue(0),
      writeStream: vi.fn().mockResolvedValue({ bytesWritten: 100, aborted: false }),
    };

    const process = createProcessDownloadClaim({
      releaseRepo: releaseRepo as ReleaseRepository,
      mediaAssetRepo: mediaAssetRepo as MediaAssetRepository,
      messageRepo: messageRepo as MessageRepository,
      telegramAccess: telegramAccess as TelegramAccessPort,
      staging: staging as StagingFilesystemPort,
      downloadRepo: downloadRepo as DownloadRepository,
      progressReportIntervalMs: 5000,
      leaseDurationMs: 60000,
    });

    await process(download(), "w1", 2000);

    expect(mediaAssetRepo.updateAvailability).toHaveBeenCalledWith(20, { availability: "available", now: 2000 });
    expect(downloadRepo.complete).toHaveBeenCalledWith(1, "w1", "/staging/1-episode.mp4", 100, expect.any(Number));
  });
});

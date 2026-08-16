import { describe, expect, it } from "vitest";
import type { Release } from "../../catalog/domain/release.js";
import type { ReleaseRepository } from "../../catalog/ports/release-repository.js";
import type { Download } from "../domain/download.js";
import type { DownloadRepository } from "../ports/download-repository.js";
import { createDownloadQueueUseCases } from "./download-queue.js";

function download(overrides: Partial<Download> = {}): Download {
  return {
    id: 1,
    releaseId: 1,
    clientHash: "hash-1",
    desiredState: "queued",
    observedState: "downloading",
    progressBytes: 500,
    totalBytes: 1000,
    stagingPath: null,
    category: null,
    workerId: null,
    leaseExpiresAt: null,
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
    reviewState: "approved",
    manuallyVerified: true,
    manuallyVerifiedAt: 1000,
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

function fakeDownloadRepo(downloads: Download[]): DownloadRepository {
  return {
    async create() {
      throw new Error("not used");
    },
    async findById(id) {
      return downloads.find((d) => d.id === id) ?? null;
    },
    async findActiveByReleaseId() {
      throw new Error("not used");
    },
    async findLatestByClientHash() {
      throw new Error("not used");
    },
    async listActive() {
      return downloads;
    },
    async claim() {
      throw new Error("not used");
    },
    async reportProgress() {
      throw new Error("not used");
    },
    async pause() {
      throw new Error("not used");
    },
    async cancel() {
      throw new Error("not used");
    },
    async complete() {
      throw new Error("not used");
    },
    async fail() {
      throw new Error("not used");
    },
    async requestDesiredState() {
      throw new Error("not used");
    },
  };
}

function fakeReleaseRepo(releases: Release[]): ReleaseRepository {
  return {
    async findById(id) {
      return releases.find((r) => r.id === id) ?? null;
    },
    async findByMediaAssetId() {
      throw new Error("not used");
    },
    async listByReviewState() {
      throw new Error("not used");
    },
    async create() {
      throw new Error("not used");
    },
    async update() {
      throw new Error("not used");
    },
  };
}

describe("download queue use cases", () => {
  it("pairs each download with its release", async () => {
    const useCases = createDownloadQueueUseCases({
      downloadRepo: fakeDownloadRepo([download({ id: 1, releaseId: 5 })]),
      releaseRepo: fakeReleaseRepo([release({ id: 5, displayTitle: "The.Wire.S02E05.1080p.Telegram" })]),
    });

    const rows = await useCases.listDownloads();

    expect(rows).toEqual([
      { download: download({ id: 1, releaseId: 5 }), release: release({ id: 5, displayTitle: "The.Wire.S02E05.1080p.Telegram" }) },
    ]);
  });

  it("pairs with a null release if the release is missing", async () => {
    const useCases = createDownloadQueueUseCases({
      downloadRepo: fakeDownloadRepo([download({ id: 1, releaseId: 999 })]),
      releaseRepo: fakeReleaseRepo([]),
    });

    const rows = await useCases.listDownloads();

    expect(rows[0]?.release).toBeNull();
  });
});

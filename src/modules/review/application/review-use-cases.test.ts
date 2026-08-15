import { describe, expect, it } from "vitest";
import type { Release } from "../../catalog/domain/release.js";
import type { ReleaseRevision } from "../../catalog/domain/release-revision.js";
import type { Series } from "../../catalog/domain/series.js";
import type { ReleaseRepository } from "../../catalog/ports/release-repository.js";
import type { ReleaseRevisionRepository } from "../../catalog/ports/release-revision-repository.js";
import type { SeriesRepository } from "../../catalog/ports/series-repository.js";
import { createReviewUseCases, ReleaseNotFoundError } from "./review-use-cases.js";

function createFakeReleaseRepo(initial: Release[]): ReleaseRepository {
  const releases = new Map<number, Release>(initial.map((r) => [r.id, r]));
  return {
    async findById(id) {
      return releases.get(id) ?? null;
    },
    async findByMediaAssetId(mediaAssetId) {
      return [...releases.values()].find((r) => r.mediaAssetId === mediaAssetId) ?? null;
    },
    async create() {
      throw new Error("not used in review tests");
    },
    async update(input) {
      const existing = releases.get(input.releaseId);
      if (!existing) throw new Error("release not found");
      const updated: Release = { ...existing, ...input.fields, updatedAt: input.now };
      releases.set(updated.id, updated);
      return updated;
    },
  };
}

function createFakeReleaseRevisionRepo(): ReleaseRevisionRepository & { revisions: ReleaseRevision[] } {
  const revisions: ReleaseRevision[] = [];
  let nextId = 1;
  return {
    revisions,
    async insert(input) {
      const rev: ReleaseRevision = {
        id: nextId++,
        releaseId: input.releaseId,
        extractionRunId: input.extractionRunId,
        changeSource: input.changeSource,
        before: input.before,
        after: input.after,
        actor: input.actor,
        createdAt: input.now,
      };
      revisions.push(rev);
      return rev;
    },
    async listByReleaseId(releaseId) {
      return revisions.filter((r) => r.releaseId === releaseId);
    },
  };
}

function createFakeSeriesRepo(series: Series[]): SeriesRepository {
  return {
    async findById(id) {
      return series.find((s) => s.id === id) ?? null;
    },
    async create() {
      throw new Error("not used in review tests");
    },
  };
}

const PENDING_RELEASE: Release = {
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
};

const SERIES: Series = { id: 1, canonicalTitle: "Fauda", originalLanguage: "he", createdAt: 500, updatedAt: 500 };

describe("review use cases", () => {
  it("approveRelease sets reviewState=approved and manuallyVerified=true, recording a revision", async () => {
    const releaseRevisionRepo = createFakeReleaseRevisionRepo();
    const useCases = createReviewUseCases({
      releaseRepo: createFakeReleaseRepo([PENDING_RELEASE]),
      releaseRevisionRepo,
      seriesRepo: createFakeSeriesRepo([SERIES]),
    });

    const result = await useCases.approveRelease(1, "operator", 2000);

    expect(result.reviewState).toBe("approved");
    expect(result.manuallyVerified).toBe(true);
    expect(result.manuallyVerifiedAt).toBe(2000);
    expect(releaseRevisionRepo.revisions).toHaveLength(1);
    expect(releaseRevisionRepo.revisions[0]).toMatchObject({ changeSource: "review", actor: "operator" });
  });

  it("rejectRelease sets reviewState=rejected and manuallyVerified=true", async () => {
    const useCases = createReviewUseCases({
      releaseRepo: createFakeReleaseRepo([PENDING_RELEASE]),
      releaseRevisionRepo: createFakeReleaseRevisionRepo(),
      seriesRepo: createFakeSeriesRepo([SERIES]),
    });

    const result = await useCases.rejectRelease(1, "operator", 2000);

    expect(result.reviewState).toBe("rejected");
    expect(result.manuallyVerified).toBe(true);
  });

  it("editRelease applies partial field overrides and recomputes the display title", async () => {
    const useCases = createReviewUseCases({
      releaseRepo: createFakeReleaseRepo([PENDING_RELEASE]),
      releaseRevisionRepo: createFakeReleaseRevisionRepo(),
      seriesRepo: createFakeSeriesRepo([SERIES]),
    });

    const result = await useCases.editRelease(1, { episode: 4 }, "operator", 2000);

    expect(result.episode).toBe(4);
    expect(result.season).toBe(4);
    expect(result.displayTitle).toBe("Fauda.S04E03.1080p.Telegram".replace("E03", "E04"));
    expect(result.manuallyVerified).toBe(true);
  });

  it("editRelease leaves fields not specified in the input untouched", async () => {
    const useCases = createReviewUseCases({
      releaseRepo: createFakeReleaseRepo([PENDING_RELEASE]),
      releaseRevisionRepo: createFakeReleaseRevisionRepo(),
      seriesRepo: createFakeSeriesRepo([SERIES]),
    });

    const result = await useCases.editRelease(1, { resolution: "720p" }, "operator", 2000);

    expect(result.resolution).toBe("720p");
    expect(result.episode).toBe(3);
    expect(result.season).toBe(4);
  });

  it("throws ReleaseNotFoundError for an unknown release id", async () => {
    const useCases = createReviewUseCases({
      releaseRepo: createFakeReleaseRepo([]),
      releaseRevisionRepo: createFakeReleaseRevisionRepo(),
      seriesRepo: createFakeSeriesRepo([]),
    });

    await expect(useCases.approveRelease(999, "operator", 2000)).rejects.toThrow(ReleaseNotFoundError);
  });
});

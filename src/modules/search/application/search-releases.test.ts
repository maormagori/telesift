import { describe, expect, it } from "vitest";
import type { Release } from "../../catalog/domain/release.js";
import type { SeriesAlias } from "../../catalog/domain/series-alias.js";
import type { ReleaseSearchFilter, ReleaseSearchRepository, ReleaseSearchResult } from "../../catalog/ports/release-search-repository.js";
import type { SeriesAliasRepository } from "../../catalog/ports/series-alias-repository.js";
import { createSearchReleasesUseCase } from "./search-releases.js";

function fakeRelease(overrides: Partial<Release> = {}): Release {
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
    manuallyVerified: false,
    manuallyVerifiedAt: null,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function fakeSeriesAliasRepo(aliases: SeriesAlias[]): SeriesAliasRepository {
  return {
    async listAll() {
      return aliases;
    },
    async listBySeriesId(seriesId) {
      return aliases.filter((a) => a.seriesId === seriesId);
    },
    async create() {
      throw new Error("not used in this test");
    },
  };
}

function fakeReleaseSearchRepo(result: ReleaseSearchResult[]): ReleaseSearchRepository & { lastFilter: ReleaseSearchFilter | null } {
  const repo = {
    lastFilter: null as ReleaseSearchFilter | null,
    async searchApproved(filter: ReleaseSearchFilter) {
      repo.lastFilter = filter;
      return { items: result, total: result.length };
    },
  };
  return repo;
}

const aliases: SeriesAlias[] = [
  { id: 1, seriesId: 1, aliasNormalized: "fauda", aliasOriginal: "Fauda", language: "en", source: "manual", createdAt: 1 },
  { id: 2, seriesId: 2, aliasNormalized: "the wire", aliasOriginal: "The Wire", language: "en", source: "manual", createdAt: 1 },
];

describe("createSearchReleasesUseCase", () => {
  it("matches the query against series aliases and filters releases by matched series", async () => {
    const releaseSearchRepo = fakeReleaseSearchRepo([{ release: fakeRelease(), sizeBytes: 100, availability: "available" }]);
    const searchReleases = createSearchReleasesUseCase({
      seriesAliasRepo: fakeSeriesAliasRepo(aliases),
      releaseSearchRepo,
      seriesMatchThreshold: 0.85,
    });

    const result = await searchReleases({ queryText: "Fauda", season: null, episode: null, offset: 0, limit: 50 });

    expect(result.matchedSeriesIds).toEqual([1]);
    expect(result.items).toHaveLength(1);
    expect(releaseSearchRepo.lastFilter).toMatchObject({ seriesIds: [1] });
  });

  it("returns an empty result without querying releases when no series matches", async () => {
    const releaseSearchRepo = fakeReleaseSearchRepo([{ release: fakeRelease(), sizeBytes: 100, availability: "available" }]);
    const searchReleases = createSearchReleasesUseCase({
      seriesAliasRepo: fakeSeriesAliasRepo(aliases),
      releaseSearchRepo,
      seriesMatchThreshold: 0.85,
    });

    const result = await searchReleases({ queryText: "some unknown show", season: null, episode: null, offset: 0, limit: 50 });

    expect(result).toEqual({ items: [], total: 0, matchedSeriesIds: [] });
    expect(releaseSearchRepo.lastFilter).toBeNull();
  });

  it("blank query browses all approved/available releases with no series filter", async () => {
    const releaseSearchRepo = fakeReleaseSearchRepo([{ release: fakeRelease(), sizeBytes: 100, availability: "available" }]);
    const searchReleases = createSearchReleasesUseCase({
      seriesAliasRepo: fakeSeriesAliasRepo(aliases),
      releaseSearchRepo,
      seriesMatchThreshold: 0.85,
    });

    const result = await searchReleases({ queryText: null, season: null, episode: null, offset: 0, limit: 50 });

    expect(result.matchedSeriesIds).toEqual([]);
    expect(releaseSearchRepo.lastFilter).toMatchObject({ seriesIds: null });
  });

  it("passes season/episode/offset/limit through to the repository", async () => {
    const releaseSearchRepo = fakeReleaseSearchRepo([]);
    const searchReleases = createSearchReleasesUseCase({
      seriesAliasRepo: fakeSeriesAliasRepo(aliases),
      releaseSearchRepo,
      seriesMatchThreshold: 0.85,
    });

    await searchReleases({ queryText: null, season: 4, episode: 3, offset: 10, limit: 5 });

    expect(releaseSearchRepo.lastFilter).toEqual({ seriesIds: null, season: 4, episode: 3, offset: 10, limit: 5 });
  });
});

import { describe, expect, it } from "vitest";
import type { ExtractionResult } from "../../extraction/domain/extraction-result-schema.js";
import type { Release } from "../domain/release.js";
import type { ReleaseRevision } from "../domain/release-revision.js";
import type { Series } from "../domain/series.js";
import type { SeriesAlias } from "../domain/series-alias.js";
import type { ReleaseRepository } from "../ports/release-repository.js";
import type { ReleaseRevisionRepository } from "../ports/release-revision-repository.js";
import type { SeriesAliasRepository } from "../ports/series-alias-repository.js";
import type { SeriesRepository } from "../ports/series-repository.js";
import { createMaterializeRelease } from "./materialize-release.js";

function baseExtraction(overrides: Partial<ExtractionResult> = {}): ExtractionResult {
  return {
    isTvEpisode: true,
    seriesTitleObserved: "Fauda",
    season: 4,
    episode: 3,
    language: "he",
    ambiguities: [],
    recommendedState: "index",
    ...overrides,
  };
}

function createFakeSeriesRepo(): SeriesRepository {
  const series = new Map<number, Series>();
  let nextId = 1;
  return {
    async findById(id) {
      return series.get(id) ?? null;
    },
    async create(input) {
      const s: Series = { id: nextId++, canonicalTitle: input.canonicalTitle, originalLanguage: input.originalLanguage, createdAt: input.now, updatedAt: input.now };
      series.set(s.id, s);
      return s;
    },
    async search(query) {
      return [...series.values()].filter((s) => s.canonicalTitle.toLowerCase().includes(query.toLowerCase()));
    },
  };
}

function createFakeSeriesAliasRepo(initial: SeriesAlias[] = []): SeriesAliasRepository {
  const aliases = [...initial];
  let nextId = aliases.length + 1;
  return {
    async listAll() {
      return aliases;
    },
    async listBySeriesId(seriesId) {
      return aliases.filter((a) => a.seriesId === seriesId);
    },
    async create(input) {
      const existing = aliases.find((a) => a.seriesId === input.seriesId && a.aliasNormalized === input.aliasNormalized);
      if (existing) return existing;
      const alias: SeriesAlias = {
        id: nextId++,
        seriesId: input.seriesId,
        aliasNormalized: input.aliasNormalized,
        aliasOriginal: input.aliasOriginal,
        language: input.language,
        source: input.source,
        createdAt: input.now,
      };
      aliases.push(alias);
      return alias;
    },
  };
}

function createFakeReleaseRepo(initial: Release[] = []): ReleaseRepository {
  const releases = new Map<number, Release>(initial.map((r) => [r.id, r]));
  let nextId = initial.length + 1;
  return {
    async findById(id) {
      return releases.get(id) ?? null;
    },
    async findByMediaAssetId(mediaAssetId) {
      return [...releases.values()].find((r) => r.mediaAssetId === mediaAssetId) ?? null;
    },
    async listByReviewState(reviewState, options) {
      return [...releases.values()]
        .filter((r) => r.reviewState === reviewState && (options.afterId === null || r.id > options.afterId))
        .sort((a, b) => a.id - b.id)
        .slice(0, options.limit);
    },
    async create(input) {
      const r: Release = { id: nextId++, mediaAssetId: input.mediaAssetId, ...input.fields, createdAt: input.now, updatedAt: input.now };
      releases.set(r.id, r);
      return r;
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

const BASE_INPUT = {
  mediaAssetId: 1,
  extractionRunId: 1,
  fileName: "Fauda.S04E03.1080p.mkv",
  contextTexts: ["Fauda S04E03"],
  assetHeight: 1080,
  deterministicSeason: 4,
  deterministicEpisode: 3,
  deterministicResolution: "1080p",
  deterministicSource: null,
  deterministicCodec: null,
  now: 1000,
};

describe("materializeRelease", () => {
  it("creates a new series/alias and a pending_review release when there is no local match", async () => {
    const seriesAliasRepo = createFakeSeriesAliasRepo();
    const materializeRelease = createMaterializeRelease({
      seriesRepo: createFakeSeriesRepo(),
      seriesAliasRepo,
      releaseRepo: createFakeReleaseRepo(),
      releaseRevisionRepo: createFakeReleaseRevisionRepo(),
      seriesMatchThreshold: 0.8,
      autoIndexEnabled: true,
    });

    const result = await materializeRelease({ ...BASE_INPUT, extraction: baseExtraction() });

    expect(result.release.reviewState).toBe("pending_review");
    expect(result.release.seriesId).not.toBeNull();
    expect((await seriesAliasRepo.listAll())).toHaveLength(1);
  });

  it("auto-approves a confident release that matches an existing series", async () => {
    const seriesRepo = createFakeSeriesRepo();
    const existingSeries = await seriesRepo.create({ canonicalTitle: "Fauda", originalLanguage: "he", now: 500 });
    const seriesAliasRepo = createFakeSeriesAliasRepo([
      { id: 1, seriesId: existingSeries.id, aliasNormalized: "fauda", aliasOriginal: "Fauda", language: "he", source: "manual", createdAt: 500 },
    ]);
    const materializeRelease = createMaterializeRelease({
      seriesRepo,
      seriesAliasRepo,
      releaseRepo: createFakeReleaseRepo(),
      releaseRevisionRepo: createFakeReleaseRevisionRepo(),
      seriesMatchThreshold: 0.8,
      autoIndexEnabled: true,
    });

    const result = await materializeRelease({ ...BASE_INPUT, extraction: baseExtraction() });

    expect(result.release.reviewState).toBe("approved");
    expect(result.release.manuallyVerified).toBe(false);
    expect(result.release.seriesId).toBe(existingSeries.id);
    expect(result.release.displayTitle).toBe("Fauda.S04E03.1080p.Telegram");
  });

  it("sends to pending_review when the cross-check disagrees with the deterministic pre-pass", async () => {
    const seriesRepo = createFakeSeriesRepo();
    const existingSeries = await seriesRepo.create({ canonicalTitle: "Fauda", originalLanguage: "he", now: 500 });
    const seriesAliasRepo = createFakeSeriesAliasRepo([
      { id: 1, seriesId: existingSeries.id, aliasNormalized: "fauda", aliasOriginal: "Fauda", language: "he", source: "manual", createdAt: 500 },
    ]);
    const materializeRelease = createMaterializeRelease({
      seriesRepo,
      seriesAliasRepo,
      releaseRepo: createFakeReleaseRepo(),
      releaseRevisionRepo: createFakeReleaseRevisionRepo(),
      seriesMatchThreshold: 0.8,
      autoIndexEnabled: true,
    });

    const result = await materializeRelease({ ...BASE_INPUT, deterministicSeason: 1, extraction: baseExtraction() });

    expect(result.release.reviewState).toBe("pending_review");
  });

  it("updates an existing, never-manually-verified release in place on re-extraction", async () => {
    const seriesRepo = createFakeSeriesRepo();
    const existingSeries = await seriesRepo.create({ canonicalTitle: "Fauda", originalLanguage: "he", now: 500 });
    const seriesAliasRepo = createFakeSeriesAliasRepo([
      { id: 1, seriesId: existingSeries.id, aliasNormalized: "fauda", aliasOriginal: "Fauda", language: "he", source: "manual", createdAt: 500 },
    ]);
    const releaseRepo = createFakeReleaseRepo([
      {
        id: 1,
        mediaAssetId: 1,
        seriesId: existingSeries.id,
        extractionRunId: 0,
        season: 4,
        episode: 3,
        resolution: "720p",
        source: null,
        codec: null,
        language: "he",
        displayTitle: "Fauda.S04E03.720p.Telegram",
        reviewState: "pending_review",
        manuallyVerified: false,
        manuallyVerifiedAt: null,
        createdAt: 500,
        updatedAt: 500,
      },
    ]);
    const releaseRevisionRepo = createFakeReleaseRevisionRepo();
    const materializeRelease = createMaterializeRelease({
      seriesRepo,
      seriesAliasRepo,
      releaseRepo,
      releaseRevisionRepo,
      seriesMatchThreshold: 0.8,
      autoIndexEnabled: true,
    });

    const result = await materializeRelease({ ...BASE_INPUT, extraction: baseExtraction() });

    expect(result.changed).toBe(true);
    expect(result.release.resolution).toBe("1080p");
    expect(releaseRevisionRepo.revisions).toHaveLength(1);
    expect(releaseRevisionRepo.revisions[0]).toMatchObject({ changeSource: "extraction", actor: "system" });
  });

  it("never overwrites a manually verified release, but still records what would have changed", async () => {
    const seriesRepo = createFakeSeriesRepo();
    const existingSeries = await seriesRepo.create({ canonicalTitle: "Fauda", originalLanguage: "he", now: 500 });
    const seriesAliasRepo = createFakeSeriesAliasRepo([
      { id: 1, seriesId: existingSeries.id, aliasNormalized: "fauda", aliasOriginal: "Fauda", language: "he", source: "manual", createdAt: 500 },
    ]);
    const verifiedRelease: Release = {
      id: 1,
      mediaAssetId: 1,
      seriesId: existingSeries.id,
      extractionRunId: 0,
      season: 4,
      episode: 3,
      resolution: "720p",
      source: null,
      codec: null,
      language: "he",
      displayTitle: "Fauda.S04E03.720p.Telegram",
      reviewState: "approved",
      manuallyVerified: true,
      manuallyVerifiedAt: 600,
      createdAt: 500,
      updatedAt: 600,
    };
    const releaseRepo = createFakeReleaseRepo([verifiedRelease]);
    const releaseRevisionRepo = createFakeReleaseRevisionRepo();
    const materializeRelease = createMaterializeRelease({
      seriesRepo,
      seriesAliasRepo,
      releaseRepo,
      releaseRevisionRepo,
      seriesMatchThreshold: 0.8,
      autoIndexEnabled: true,
    });

    const result = await materializeRelease({ ...BASE_INPUT, extraction: baseExtraction() });

    expect(result.changed).toBe(false);
    expect(result.release).toEqual(verifiedRelease);
    expect(releaseRevisionRepo.revisions).toHaveLength(1);
    expect(releaseRevisionRepo.revisions[0]?.after.resolution).toBe("1080p");
    expect(releaseRevisionRepo.revisions[0]?.before.resolution).toBe("720p");
  });

  it("refuses to create a series when the observed title is absent from the source text", async () => {
    const seriesRepo = createFakeSeriesRepo();
    const seriesAliasRepo = createFakeSeriesAliasRepo();
    const materializeRelease = createMaterializeRelease({
      seriesRepo,
      seriesAliasRepo,
      releaseRepo: createFakeReleaseRepo(),
      releaseRevisionRepo: createFakeReleaseRevisionRepo(),
      seriesMatchThreshold: 0.8,
      autoIndexEnabled: true,
    });

    // The real failure mode: a caption naming one show, an extraction naming another.
    const result = await materializeRelease({
      ...BASE_INPUT,
      fileName: null,
      contextTexts: ["Example Show Season 8 Episode 33"],
      extraction: baseExtraction({ seriesTitleObserved: "A Different Show Entirely" }),
    });

    expect(result.release.seriesId).toBeNull();
    expect(result.release.reviewState).toBe("pending_review");
    expect(await seriesAliasRepo.listAll()).toHaveLength(0);
  });

  it("refuses to create a series from a title with no letters", async () => {
    const seriesAliasRepo = createFakeSeriesAliasRepo();
    const materializeRelease = createMaterializeRelease({
      seriesRepo: createFakeSeriesRepo(),
      seriesAliasRepo,
      releaseRepo: createFakeReleaseRepo(),
      releaseRevisionRepo: createFakeReleaseRevisionRepo(),
      seriesMatchThreshold: 0.8,
      autoIndexEnabled: true,
    });

    const result = await materializeRelease({
      ...BASE_INPUT,
      extraction: baseExtraction({ seriesTitleObserved: " (^)( *)?" }),
    });

    expect(result.release.seriesId).toBeNull();
    expect(await seriesAliasRepo.listAll()).toHaveLength(0);
  });

  it("refuses to name a series after the filename when no title was observed", async () => {
    const seriesAliasRepo = createFakeSeriesAliasRepo();
    const materializeRelease = createMaterializeRelease({
      seriesRepo: createFakeSeriesRepo(),
      seriesAliasRepo,
      releaseRepo: createFakeReleaseRepo(),
      releaseRevisionRepo: createFakeReleaseRevisionRepo(),
      seriesMatchThreshold: 0.8,
      autoIndexEnabled: true,
    });

    const result = await materializeRelease({
      ...BASE_INPUT,
      fileName: "index.mp4",
      contextTexts: [null],
      extraction: baseExtraction({ seriesTitleObserved: null }),
    });

    expect(result.release.seriesId).toBeNull();
    expect(await seriesAliasRepo.listAll()).toHaveLength(0);
  });

  it("sends to pending_review regardless of confidence when auto-index is disabled", async () => {
    const seriesRepo = createFakeSeriesRepo();
    const existingSeries = await seriesRepo.create({ canonicalTitle: "Fauda", originalLanguage: "he", now: 500 });
    const seriesAliasRepo = createFakeSeriesAliasRepo([
      { id: 1, seriesId: existingSeries.id, aliasNormalized: "fauda", aliasOriginal: "Fauda", language: "he", source: "manual", createdAt: 500 },
    ]);
    const materializeRelease = createMaterializeRelease({
      seriesRepo,
      seriesAliasRepo,
      releaseRepo: createFakeReleaseRepo(),
      releaseRevisionRepo: createFakeReleaseRevisionRepo(),
      seriesMatchThreshold: 0.8,
      autoIndexEnabled: false,
    });

    const result = await materializeRelease({ ...BASE_INPUT, extraction: baseExtraction() });

    expect(result.release.reviewState).toBe("pending_review");
  });
});

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type BetterSqlite3 from "better-sqlite3";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSqliteContextGroupRepository } from "../../../adapters/sqlite/context-group-repository.js";
import { createKyselyDb, openDatabase } from "../../../adapters/sqlite/connection.js";
import { createSqliteExtractionRunRepository } from "../../../adapters/sqlite/extraction-run-repository.js";
import { createSqliteMediaAssetRepository } from "../../../adapters/sqlite/media-asset-repository.js";
import { applyMigrations, MIGRATIONS_DIR } from "../../../adapters/sqlite/migrate.js";
import { createSqliteMessageRepository } from "../../../adapters/sqlite/message-repository.js";
import { createSqliteReleaseRepository } from "../../../adapters/sqlite/release-repository.js";
import { createSqliteReleaseRevisionRepository } from "../../../adapters/sqlite/release-revision-repository.js";
import type { DB } from "../../../adapters/sqlite/schema.js";
import { createSqliteSeriesAliasRepository } from "../../../adapters/sqlite/series-alias-repository.js";
import { createSqliteSeriesRepository } from "../../../adapters/sqlite/series-repository.js";
import { createSqliteTelegramChatRepository } from "../../../adapters/sqlite/telegram-chat-repository.js";
import { createFakeLlmExtractor, type LlmFakeResponder } from "../../../adapters/llm-fake/fake-llm-extractor.js";
import { AMBIGUOUS_EPISODE_RESULT, CONFIDENT_EPISODE_RESULT, NEGATIVE_RESULT } from "../../../adapters/llm-fake/fixtures.js";
import { createMaterializeRelease } from "../../catalog/application/materialize-release.js";
import { createBuildOrRefreshContextGroup } from "../../context/application/build-or-refresh-context-group.js";
import { createProcessMediaProcessingJob } from "./process-media-processing-job.js";

const VERSIONS = { pipelineVersion: "v1", promptVersion: "v1", modelVersion: "fake" };

function wireDeps(kysely: Kysely<DB>, responder: LlmFakeResponder) {
  const messageRepo = createSqliteMessageRepository(kysely);
  const mediaAssetRepo = createSqliteMediaAssetRepository(kysely);
  const telegramChatRepo = createSqliteTelegramChatRepository(kysely);
  const contextGroupRepo = createSqliteContextGroupRepository(kysely);
  const extractionRunRepo = createSqliteExtractionRunRepository(kysely);
  const seriesRepo = createSqliteSeriesRepository(kysely);
  const seriesAliasRepo = createSqliteSeriesAliasRepository(kysely);
  const releaseRepo = createSqliteReleaseRepository(kysely);
  const releaseRevisionRepo = createSqliteReleaseRevisionRepository(kysely);
  const llmExtractor = createFakeLlmExtractor(responder);

  const buildOrRefreshContextGroup = createBuildOrRefreshContextGroup({
    mediaAssetRepo,
    messageRepo,
    contextGroupRepo,
    precedingWindowSize: 2,
    quietPeriodMs: 10_000,
  });

  const materializeRelease = createMaterializeRelease({
    seriesRepo,
    seriesAliasRepo,
    releaseRepo,
    releaseRevisionRepo,
    seriesMatchThreshold: 0.8,
    autoIndexEnabled: true,
  });

  const processJob = createProcessMediaProcessingJob({
    mediaAssetRepo,
    messageRepo,
    telegramChatRepo,
    buildOrRefreshContextGroup,
    extractionRunRepo,
    llmExtractor,
    seriesRepo,
    seriesAliasRepo,
    materializeRelease,
    versions: VERSIONS,
  });

  return { messageRepo, telegramChatRepo, seriesRepo, seriesAliasRepo, releaseRepo, extractionRunRepo, llmExtractor, processJob };
}

describe("processMediaProcessingJob (pipeline integration)", () => {
  let dir: string;
  let db: BetterSqlite3.Database;
  let kysely: Kysely<DB>;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "telesift-pipeline-"));
    db = openDatabase(path.join(dir, "telesift.sqlite3"));
    kysely = createKyselyDb(db);
    await applyMigrations(kysely, MIGRATIONS_DIR);
  });

  afterEach(async () => {
    await kysely.destroy();
    await rm(dir, { recursive: true, force: true });
  });

  async function seedMediaAsset(deps: ReturnType<typeof wireDeps>, telegramMessageId = 1, fileName = "Fauda.S04E03.1080p.mkv") {
    await deps.telegramChatRepo.upsert({ telegramId: "-100123", title: "Some Channel", type: "channel", username: null, now: 1 });
    const result = await deps.messageRepo.upsertMessage({
      chatId: "-100123",
      telegramMessageId,
      text: "New episode",
      replyToMessageId: null,
      mediaGroupId: null,
      sourceDate: 1000,
      sourceEditedAt: null,
      media: { fileName, mimeType: "video/mp4", sizeBytes: 100, durationSeconds: 60, width: 1920, height: 1080 },
      now: 1000,
    });
    return result.mediaAsset!.id;
  }

  it("a confident extraction matching an existing series auto-approves the release and calls the LLM only once across repeated runs", async () => {
    const deps = wireDeps(kysely, () => CONFIDENT_EPISODE_RESULT);
    const series = await deps.seriesRepo.create({ canonicalTitle: "Fauda", originalLanguage: "he", now: 500 });
    await deps.seriesAliasRepo.create({ seriesId: series.id, aliasNormalized: "fauda", aliasOriginal: "Fauda", language: "he", source: "manual", now: 500 });
    const mediaAssetId = await seedMediaAsset(deps);

    const first = await deps.processJob(mediaAssetId, 5000);
    expect(first.kind).toBe("processed");
    if (first.kind !== "processed") throw new Error("unreachable");
    expect(first.llmCalled).toBe(true);
    expect(first.release?.reviewState).toBe("approved");
    expect(first.release?.manuallyVerified).toBe(false);
    expect(deps.llmExtractor.callCount).toBe(1);

    const second = await deps.processJob(mediaAssetId, 6000);
    expect(second.kind).toBe("processed");
    if (second.kind !== "processed") throw new Error("unreachable");
    expect(second.llmCalled).toBe(false);
    expect(deps.llmExtractor.callCount).toBe(1);

    const runsCount = (db.prepare("SELECT COUNT(*) AS n FROM extraction_runs").get() as { n: number }).n;
    expect(runsCount).toBe(1);
  });

  it("an ambiguous extraction lands in pending_review even though isTvEpisode is true", async () => {
    const deps = wireDeps(kysely, () => AMBIGUOUS_EPISODE_RESULT);
    const mediaAssetId = await seedMediaAsset(deps, 1, "Some.Show.S01E01.mkv");

    const outcome = await deps.processJob(mediaAssetId, 5000);
    expect(outcome.kind).toBe("processed");
    if (outcome.kind !== "processed") throw new Error("unreachable");
    expect(outcome.release?.reviewState).toBe("pending_review");
  });

  it("dedups a negative (isTvEpisode: false) classification the same as a positive one, and creates no release", async () => {
    const deps = wireDeps(kysely, () => NEGATIVE_RESULT);
    const mediaAssetId = await seedMediaAsset(deps, 1, "some-promo-video.mp4");

    const first = await deps.processJob(mediaAssetId, 5000);
    const second = await deps.processJob(mediaAssetId, 6000);

    expect(first.kind).toBe("processed");
    expect(second.kind).toBe("processed");
    if (first.kind !== "processed" || second.kind !== "processed") throw new Error("unreachable");
    expect(first.release).toBeNull();
    expect(second.release).toBeNull();
    expect(second.llmCalled).toBe(false);
    expect(deps.llmExtractor.callCount).toBe(1);
    const runsCount = (db.prepare("SELECT COUNT(*) AS n FROM extraction_runs").get() as { n: number }).n;
    expect(runsCount).toBe(1);
  });

  it("never overwrites a manually verified release when a later re-extraction disagrees", async () => {
    const deps = wireDeps(kysely, () => CONFIDENT_EPISODE_RESULT);
    const series = await deps.seriesRepo.create({ canonicalTitle: "Fauda", originalLanguage: "he", now: 500 });
    await deps.seriesAliasRepo.create({ seriesId: series.id, aliasNormalized: "fauda", aliasOriginal: "Fauda", language: "he", source: "manual", now: 500 });
    const mediaAssetId = await seedMediaAsset(deps);

    const first = await deps.processJob(mediaAssetId, 5000);
    if (first.kind !== "processed" || !first.release) throw new Error("unreachable");

    await deps.releaseRepo.update({
      releaseId: first.release.id,
      fields: { ...first.release, manuallyVerified: true, manuallyVerifiedAt: 5500 },
      now: 5500,
    });

    await deps.messageRepo.upsertMessage({
      chatId: "-100123",
      telegramMessageId: 1,
      text: "New episode, corrected caption",
      replyToMessageId: null,
      mediaGroupId: null,
      sourceDate: 1000,
      sourceEditedAt: 6000,
      media: { fileName: "Fauda.S04E03.1080p.mkv", mimeType: "video/mp4", sizeBytes: 100, durationSeconds: 60, width: 1920, height: 1080 },
      now: 6000,
    });

    const deps2 = wireDeps(kysely, () => ({ ...CONFIDENT_EPISODE_RESULT, episode: 9 }));
    const second = await deps2.processJob(mediaAssetId, 7000);

    expect(second.kind).toBe("processed");
    if (second.kind !== "processed") throw new Error("unreachable");
    expect(second.llmCalled).toBe(true);
    expect(second.release?.episode).toBe(3);
  });

  it("updates an auto-approved (never manually verified) release in place on re-extraction", async () => {
    const deps = wireDeps(kysely, () => CONFIDENT_EPISODE_RESULT);
    const series = await deps.seriesRepo.create({ canonicalTitle: "Fauda", originalLanguage: "he", now: 500 });
    await deps.seriesAliasRepo.create({ seriesId: series.id, aliasNormalized: "fauda", aliasOriginal: "Fauda", language: "he", source: "manual", now: 500 });
    const mediaAssetId = await seedMediaAsset(deps);

    const first = await deps.processJob(mediaAssetId, 5000);
    if (first.kind !== "processed" || !first.release) throw new Error("unreachable");
    expect(first.release.manuallyVerified).toBe(false);

    await deps.messageRepo.upsertMessage({
      chatId: "-100123",
      telegramMessageId: 1,
      text: "New episode, corrected caption",
      replyToMessageId: null,
      mediaGroupId: null,
      sourceDate: 1000,
      sourceEditedAt: 6000,
      media: { fileName: "Fauda.S04E03.1080p.mkv", mimeType: "video/mp4", sizeBytes: 100, durationSeconds: 60, width: 1920, height: 1080 },
      now: 6000,
    });

    const deps2 = wireDeps(kysely, () => ({ ...CONFIDENT_EPISODE_RESULT, episode: 9 }));
    const second = await deps2.processJob(mediaAssetId, 7000);

    expect(second.kind).toBe("processed");
    if (second.kind !== "processed") throw new Error("unreachable");
    expect(second.release?.episode).toBe(9);
  });

  it("creates a new candidate series and forces pending_review when no local alias matches", async () => {
    const deps = wireDeps(kysely, () => CONFIDENT_EPISODE_RESULT);
    const mediaAssetId = await seedMediaAsset(deps);

    const outcome = await deps.processJob(mediaAssetId, 5000);
    expect(outcome.kind).toBe("processed");
    if (outcome.kind !== "processed") throw new Error("unreachable");
    expect(outcome.release?.reviewState).toBe("pending_review");
    expect(outcome.release?.seriesId).not.toBeNull();

    const aliases = await deps.seriesAliasRepo.listAll();
    expect(aliases).toHaveLength(1);
    expect(aliases[0]?.source).toBe("extraction");
  });
});

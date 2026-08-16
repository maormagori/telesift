import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type BetterSqlite3 from "better-sqlite3";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ReleaseFields } from "../../modules/catalog/domain/release.js";
import type { ReleaseRepository } from "../../modules/catalog/ports/release-repository.js";
import { createKyselyDb, openDatabase } from "./connection.js";
import { applyMigrations, MIGRATIONS_DIR } from "./migrate.js";
import { createSqliteReleaseRepository } from "./release-repository.js";
import type { DB } from "./schema.js";

function seedMediaAssetWithExtractionRun(db: BetterSqlite3.Database, telegramMessageId: number): { mediaAssetId: number; extractionRunId: number } {
  db.prepare(
    "INSERT INTO telegram_chats (telegram_id, title, type, created_at, updated_at) VALUES ('-100123', 'Chat', 'channel', 1, 1) ON CONFLICT DO NOTHING",
  ).run();
  const message = db
    .prepare(
      "INSERT INTO telegram_messages (chat_id, telegram_message_id, source_date, fingerprint, created_at, updated_at) VALUES ('-100123', ?, 1, 'fp', 1, 1) RETURNING id",
    )
    .get(telegramMessageId) as { id: number };
  const mediaAsset = db
    .prepare("INSERT INTO media_assets (message_id, created_at, updated_at) VALUES (?, 1, 1) RETURNING id")
    .get(message.id) as { id: number };
  const group = db
    .prepare(
      "INSERT INTO context_groups (media_asset_id, status, input_fingerprint, created_at, updated_at) VALUES (?, 'closed', 'ctx-fp', 1, 1) RETURNING id",
    )
    .get(mediaAsset.id) as { id: number };
  const run = db
    .prepare(
      "INSERT INTO extraction_runs (context_group_id, input_fingerprint, pipeline_version, prompt_version, model_version, status, is_tv_episode, result_json, created_at) VALUES (?, 'fp', 'p1', 'pr1', 'm1', 'succeeded', 1, '{}', 1) RETURNING id",
    )
    .get(group.id) as { id: number };
  return { mediaAssetId: mediaAsset.id, extractionRunId: run.id };
}

function fields(overrides: Partial<ReleaseFields> = {}): ReleaseFields {
  return {
    seriesId: null,
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
    ...overrides,
  };
}

describe("sqlite release repository", () => {
  let dir: string;
  let db: BetterSqlite3.Database;
  let kysely: Kysely<DB>;
  let repo: ReleaseRepository;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "telesift-releases-"));
    db = openDatabase(path.join(dir, "telesift.sqlite3"));
    kysely = createKyselyDb(db);
    await applyMigrations(kysely, MIGRATIONS_DIR);
    repo = createSqliteReleaseRepository(kysely);
  });

  afterEach(async () => {
    await kysely.destroy();
    await rm(dir, { recursive: true, force: true });
  });

  it("create then findById/findByMediaAssetId return the same release", async () => {
    const { mediaAssetId, extractionRunId } = seedMediaAssetWithExtractionRun(db, 1);
    const created = await repo.create({ mediaAssetId, fields: fields({ extractionRunId }), now: 1000 });

    expect(await repo.findById(created.id)).toEqual(created);
    expect(await repo.findByMediaAssetId(mediaAssetId)).toEqual(created);
  });

  it("findByMediaAssetId returns null when no release exists for the asset", async () => {
    expect(await repo.findByMediaAssetId(999)).toBeNull();
  });

  it("a release can be created directly as approved (the auto-index path)", async () => {
    const { mediaAssetId, extractionRunId } = seedMediaAssetWithExtractionRun(db, 1);
    const created = await repo.create({
      mediaAssetId,
      fields: fields({ extractionRunId, reviewState: "approved", manuallyVerified: false }),
      now: 1000,
    });

    expect(created.reviewState).toBe("approved");
    expect(created.manuallyVerified).toBe(false);
  });

  it("update overwrites fields and sets manuallyVerified", async () => {
    const { mediaAssetId, extractionRunId } = seedMediaAssetWithExtractionRun(db, 1);
    const created = await repo.create({ mediaAssetId, fields: fields({ extractionRunId }), now: 1000 });

    const updated = await repo.update({
      releaseId: created.id,
      fields: fields({
        extractionRunId,
        season: 4,
        episode: 4,
        reviewState: "approved",
        manuallyVerified: true,
        manuallyVerifiedAt: 2000,
      }),
      now: 2000,
    });

    expect(updated.episode).toBe(4);
    expect(updated.reviewState).toBe("approved");
    expect(updated.manuallyVerified).toBe(true);
    expect(updated.manuallyVerifiedAt).toBe(2000);
  });

  it("media_asset_id is unique: a second create for the same asset fails", async () => {
    const { mediaAssetId, extractionRunId } = seedMediaAssetWithExtractionRun(db, 1);
    await repo.create({ mediaAssetId, fields: fields({ extractionRunId }), now: 1000 });

    await expect(repo.create({ mediaAssetId, fields: fields({ extractionRunId }), now: 2000 })).rejects.toThrow();
  });

  it("listByReviewState returns only matching releases, oldest first", async () => {
    const first = seedMediaAssetWithExtractionRun(db, 1);
    const second = seedMediaAssetWithExtractionRun(db, 2);
    const third = seedMediaAssetWithExtractionRun(db, 3);
    const pending1 = await repo.create({
      mediaAssetId: first.mediaAssetId,
      fields: fields({ extractionRunId: first.extractionRunId }),
      now: 1000,
    });
    await repo.create({
      mediaAssetId: second.mediaAssetId,
      fields: fields({ extractionRunId: second.extractionRunId, reviewState: "approved" }),
      now: 1000,
    });
    const pending3 = await repo.create({
      mediaAssetId: third.mediaAssetId,
      fields: fields({ extractionRunId: third.extractionRunId }),
      now: 1000,
    });

    const page = await repo.listByReviewState("pending_review", { afterId: null, limit: 10 });

    expect(page.map((r) => r.id)).toEqual([pending1.id, pending3.id]);
  });

  it("listByReviewState pages forward with afterId", async () => {
    const first = seedMediaAssetWithExtractionRun(db, 1);
    const second = seedMediaAssetWithExtractionRun(db, 2);
    const pending1 = await repo.create({
      mediaAssetId: first.mediaAssetId,
      fields: fields({ extractionRunId: first.extractionRunId }),
      now: 1000,
    });
    const pending2 = await repo.create({
      mediaAssetId: second.mediaAssetId,
      fields: fields({ extractionRunId: second.extractionRunId }),
      now: 1000,
    });

    const page = await repo.listByReviewState("pending_review", { afterId: pending1.id, limit: 10 });

    expect(page.map((r) => r.id)).toEqual([pending2.id]);
  });
});

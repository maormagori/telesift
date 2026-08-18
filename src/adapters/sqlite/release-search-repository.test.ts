import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type BetterSqlite3 from "better-sqlite3";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { MediaAvailability } from "../../modules/ingestion/domain/media-asset.js";
import type { ReleaseSearchRepository } from "../../modules/catalog/ports/release-search-repository.js";
import { createKyselyDb, openDatabase } from "./connection.js";
import { applyMigrations, MIGRATIONS_DIR } from "./migrate.js";
import { createSqliteReleaseSearchRepository } from "./release-search-repository.js";
import type { DB } from "./schema.js";

interface SeedReleaseOptions {
  telegramMessageId: number;
  seriesId?: number | null;
  season?: number | null;
  episode?: number | null;
  reviewState?: "pending_review" | "approved" | "rejected";
  availability?: MediaAvailability;
  sizeBytes?: number | null;
  displayTitle?: string;
  createdAt?: number;
}

function seedRelease(db: BetterSqlite3.Database, options: SeedReleaseOptions): number {
  db.prepare(
    "INSERT INTO telegram_chats (telegram_id, title, type, created_at, updated_at) VALUES ('-100123', 'Chat', 'channel', 1, 1) ON CONFLICT DO NOTHING",
  ).run();
  if (options.seriesId != null) {
    db.prepare("INSERT INTO series (id, canonical_title, created_at, updated_at) VALUES (?, ?, 1, 1) ON CONFLICT DO NOTHING").run(
      options.seriesId,
      `Series ${options.seriesId}`,
    );
  }
  const message = db
    .prepare(
      "INSERT INTO telegram_messages (chat_id, telegram_message_id, source_date, fingerprint, created_at, updated_at) VALUES ('-100123', ?, 1, 'fp', 1, 1) RETURNING id",
    )
    .get(options.telegramMessageId) as { id: number };
  const mediaAsset = db
    .prepare("INSERT INTO media_assets (message_id, size_bytes, availability, created_at, updated_at) VALUES (?, ?, ?, 1, 1) RETURNING id")
    .get(message.id, options.sizeBytes ?? null, options.availability ?? "available") as { id: number };
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
  const createdAt = options.createdAt ?? 1;
  const release = db
    .prepare(
      "INSERT INTO releases (media_asset_id, series_id, extraction_run_id, season, episode, display_title, review_state, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id",
    )
    .get(
      mediaAsset.id,
      options.seriesId ?? null,
      run.id,
      options.season ?? null,
      options.episode ?? null,
      options.displayTitle ?? "Show.S01E01",
      options.reviewState ?? "approved",
      createdAt,
      createdAt,
    ) as { id: number };
  return release.id;
}

describe("sqlite release search repository", () => {
  let dir: string;
  let db: BetterSqlite3.Database;
  let kysely: Kysely<DB>;
  let repo: ReleaseSearchRepository;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "telesift-release-search-"));
    db = openDatabase(path.join(dir, "telesift.sqlite3"));
    kysely = createKyselyDb(db);
    await applyMigrations(kysely, MIGRATIONS_DIR);
    repo = createSqliteReleaseSearchRepository(kysely);
  });

  afterEach(async () => {
    await kysely.destroy();
    await rm(dir, { recursive: true, force: true });
  });

  it("excludes pending_review and rejected releases", async () => {
    seedRelease(db, { telegramMessageId: 1, reviewState: "pending_review" });
    seedRelease(db, { telegramMessageId: 2, reviewState: "rejected" });
    const approvedId = seedRelease(db, { telegramMessageId: 3, reviewState: "approved" });

    const result = await repo.searchApproved({ seriesIds: null, season: null, episode: null, offset: 0, limit: 10 });

    expect(result.items.map((i) => i.release.id)).toEqual([approvedId]);
    expect(result.total).toBe(1);
  });

  it("excludes unavailable releases but keeps available and unknown", async () => {
    seedRelease(db, { telegramMessageId: 1, availability: "unavailable" });
    const availableId = seedRelease(db, { telegramMessageId: 2, availability: "available" });
    const unknownId = seedRelease(db, { telegramMessageId: 3, availability: "unknown" });

    const result = await repo.searchApproved({ seriesIds: null, season: null, episode: null, offset: 0, limit: 10 });

    expect(new Set(result.items.map((i) => i.release.id))).toEqual(new Set([availableId, unknownId]));
  });

  it("filters by seriesIds", async () => {
    const seriesAId = seedRelease(db, { telegramMessageId: 1, seriesId: 1 });
    seedRelease(db, { telegramMessageId: 2, seriesId: 2 });

    const result = await repo.searchApproved({ seriesIds: [1], season: null, episode: null, offset: 0, limit: 10 });

    expect(result.items.map((i) => i.release.id)).toEqual([seriesAId]);
  });

  it("null seriesIds means no series filter (browse mode)", async () => {
    seedRelease(db, { telegramMessageId: 1, seriesId: 1 });
    seedRelease(db, { telegramMessageId: 2, seriesId: 2 });

    const result = await repo.searchApproved({ seriesIds: null, season: null, episode: null, offset: 0, limit: 10 });

    expect(result.total).toBe(2);
  });

  it("filters by season and episode", async () => {
    const matchId = seedRelease(db, { telegramMessageId: 1, season: 4, episode: 3 });
    seedRelease(db, { telegramMessageId: 2, season: 4, episode: 4 });
    seedRelease(db, { telegramMessageId: 3, season: 5, episode: 3 });

    const result = await repo.searchApproved({ seriesIds: null, season: 4, episode: 3, offset: 0, limit: 10 });

    expect(result.items.map((i) => i.release.id)).toEqual([matchId]);
  });

  it("reports sizeBytes and availability from the joined media asset", async () => {
    seedRelease(db, { telegramMessageId: 1, sizeBytes: 12345, availability: "unknown" });

    const result = await repo.searchApproved({ seriesIds: null, season: null, episode: null, offset: 0, limit: 10 });

    expect(result.items[0]).toMatchObject({ sizeBytes: 12345, availability: "unknown" });
  });

  it("paginates newest-first with an accurate total across pages", async () => {
    const first = seedRelease(db, { telegramMessageId: 1, createdAt: 100 });
    const second = seedRelease(db, { telegramMessageId: 2, createdAt: 200 });
    const third = seedRelease(db, { telegramMessageId: 3, createdAt: 300 });

    const page1 = await repo.searchApproved({ seriesIds: null, season: null, episode: null, offset: 0, limit: 2 });
    expect(page1.items.map((i) => i.release.id)).toEqual([third, second]);
    expect(page1.total).toBe(3);

    const page2 = await repo.searchApproved({ seriesIds: null, season: null, episode: null, offset: 2, limit: 2 });
    expect(page2.items.map((i) => i.release.id)).toEqual([first]);
    expect(page2.total).toBe(3);
  });
});

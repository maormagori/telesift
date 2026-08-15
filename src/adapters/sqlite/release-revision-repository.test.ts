import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type BetterSqlite3 from "better-sqlite3";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ReleaseFieldsSnapshot } from "../../modules/catalog/domain/release-revision.js";
import type { ReleaseRevisionRepository } from "../../modules/catalog/ports/release-revision-repository.js";
import { createKyselyDb, openDatabase } from "./connection.js";
import { applyMigrations, MIGRATIONS_DIR } from "./migrate.js";
import { createSqliteReleaseRevisionRepository } from "./release-revision-repository.js";
import type { DB } from "./schema.js";

function seedRelease(db: BetterSqlite3.Database): { releaseId: number; extractionRunId: number } {
  db.prepare(
    "INSERT INTO telegram_chats (telegram_id, title, type, created_at, updated_at) VALUES ('-100123', 'Chat', 'channel', 1, 1) ON CONFLICT DO NOTHING",
  ).run();
  const message = db
    .prepare(
      "INSERT INTO telegram_messages (chat_id, telegram_message_id, source_date, fingerprint, created_at, updated_at) VALUES ('-100123', 1, 1, 'fp', 1, 1) RETURNING id",
    )
    .get() as { id: number };
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
  const release = db
    .prepare(
      "INSERT INTO releases (media_asset_id, extraction_run_id, display_title, created_at, updated_at) VALUES (?, ?, 'Fauda.S04E03.Telegram', 1, 1) RETURNING id",
    )
    .get(mediaAsset.id, run.id) as { id: number };
  return { releaseId: release.id, extractionRunId: run.id };
}

function snapshot(overrides: Partial<ReleaseFieldsSnapshot> = {}): ReleaseFieldsSnapshot {
  return {
    seriesId: null,
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

describe("sqlite release revision repository", () => {
  let dir: string;
  let db: BetterSqlite3.Database;
  let kysely: Kysely<DB>;
  let repo: ReleaseRevisionRepository;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "telesift-release-revisions-"));
    db = openDatabase(path.join(dir, "telesift.sqlite3"));
    kysely = createKyselyDb(db);
    await applyMigrations(kysely, MIGRATIONS_DIR);
    repo = createSqliteReleaseRevisionRepository(kysely);
  });

  afterEach(async () => {
    await kysely.destroy();
    await rm(dir, { recursive: true, force: true });
  });

  it("insert records a revision with before/after snapshots", async () => {
    const { releaseId, extractionRunId } = seedRelease(db);

    const revision = await repo.insert({
      releaseId,
      extractionRunId,
      changeSource: "extraction",
      before: snapshot({ episode: 3 }),
      after: snapshot({ episode: 4 }),
      actor: "system",
      now: 1000,
    });

    expect(revision.before.episode).toBe(3);
    expect(revision.after.episode).toBe(4);
    expect(revision.changeSource).toBe("extraction");
  });

  it("listByReleaseId returns revisions oldest first", async () => {
    const { releaseId, extractionRunId } = seedRelease(db);

    await repo.insert({
      releaseId,
      extractionRunId,
      changeSource: "extraction",
      before: snapshot({ episode: 3 }),
      after: snapshot({ episode: 4 }),
      actor: "system",
      now: 1000,
    });
    await repo.insert({
      releaseId,
      extractionRunId: null,
      changeSource: "review",
      before: snapshot({ episode: 4 }),
      after: snapshot({ episode: 4, reviewState: "approved", manuallyVerified: true }),
      actor: "operator",
      now: 2000,
    });

    const revisions = await repo.listByReleaseId(releaseId);
    expect(revisions.map((r) => r.actor)).toEqual(["system", "operator"]);
  });

  it("listByReleaseId returns an empty array when the release has no revisions", async () => {
    const { releaseId } = seedRelease(db);
    expect(await repo.listByReleaseId(releaseId)).toEqual([]);
  });
});

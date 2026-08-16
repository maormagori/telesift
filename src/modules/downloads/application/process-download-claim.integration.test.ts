import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type BetterSqlite3 from "better-sqlite3";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFsStagingAdapter } from "../../../adapters/local-filesystem/fs-staging-adapter.js";
import { createKyselyDb, openDatabase } from "../../../adapters/sqlite/connection.js";
import { createSqliteDownloadRepository } from "../../../adapters/sqlite/download-repository.js";
import { createSqliteMediaAssetRepository } from "../../../adapters/sqlite/media-asset-repository.js";
import { createSqliteMessageRepository } from "../../../adapters/sqlite/message-repository.js";
import { applyMigrations, MIGRATIONS_DIR } from "../../../adapters/sqlite/migrate.js";
import { createSqliteReleaseRepository } from "../../../adapters/sqlite/release-repository.js";
import type { DB } from "../../../adapters/sqlite/schema.js";
import { createFakeTelegramAccessAdapter } from "../../../adapters/telegram-fake/fake-telegram-access-adapter.js";
import { toQbittorrentState } from "../domain/qbittorrent-state.js";
import { createProcessDownloadClaim } from "./process-download-claim.js";

function seedRelease(db: BetterSqlite3.Database, chatId: string, telegramMessageId: number, displayTitle: string): number {
  db.prepare(
    "INSERT INTO telegram_chats (telegram_id, title, type, created_at, updated_at) VALUES (?, 'Chat', 'channel', 1, 1) ON CONFLICT DO NOTHING",
  ).run(chatId);
  const message = db
    .prepare(
      "INSERT INTO telegram_messages (chat_id, telegram_message_id, source_date, fingerprint, created_at, updated_at) VALUES (?, ?, 1, 'fp', 1, 1) RETURNING id",
    )
    .get(chatId, telegramMessageId) as { id: number };
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
      "INSERT INTO releases (media_asset_id, extraction_run_id, display_title, created_at, updated_at) VALUES (?, ?, ?, 1, 1) RETURNING id",
    )
    .get(mediaAsset.id, run.id, displayTitle) as { id: number };
  return release.id;
}

describe("download worker end-to-end: claim -> verify -> stream -> complete", () => {
  let dir: string;
  let stagingDir: string;
  let db: BetterSqlite3.Database;
  let kysely: Kysely<DB>;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "telesift-download-e2e-"));
    stagingDir = path.join(dir, "staging");
    db = openDatabase(path.join(dir, "telesift.sqlite3"));
    kysely = createKyselyDb(db);
    await applyMigrations(kysely, MIGRATIONS_DIR);
  });

  afterEach(async () => {
    await kysely.destroy();
    await rm(dir, { recursive: true, force: true });
  });

  it("downloads the fixture video into the staging directory and reports pausedUP on completion", async () => {
    // channel-1 / message 102 is a real fixture in telegram-fake with known bytes.
    const releaseId = seedRelease(db, "channel-1", 102, "Fauda.S04E03.1080p.Telegram");

    const releaseRepo = createSqliteReleaseRepository(kysely);
    const mediaAssetRepo = createSqliteMediaAssetRepository(kysely);
    const messageRepo = createSqliteMessageRepository(kysely);
    const downloadRepo = createSqliteDownloadRepository(kysely);
    const telegramAccess = createFakeTelegramAccessAdapter();
    const staging = createFsStagingAdapter(stagingDir);

    const processDownloadClaim = createProcessDownloadClaim({
      releaseRepo,
      mediaAssetRepo,
      messageRepo,
      telegramAccess,
      staging,
      downloadRepo,
      progressReportIntervalMs: 5000,
      leaseDurationMs: 60000,
    });

    const created = await downloadRepo.create({ releaseId, category: null, now: 1000 });
    const claimed = await downloadRepo.claim({ workerId: "w1", now: 1000, leaseDurationMs: 60000 });
    expect(claimed?.id).toBe(created.id);

    await processDownloadClaim(claimed!, "w1", 2000);

    const finished = await downloadRepo.findById(created.id);
    expect(finished?.observedState).toBe("completed");
    expect(finished?.totalBytes).toBe("synthetic-fake-video-bytes-for-message-102".length);
    expect(toQbittorrentState(finished!)).toBe("pausedUP");

    const fileContent = await readFile(finished!.stagingPath!);
    expect(fileContent.toString()).toBe("synthetic-fake-video-bytes-for-message-102");

    const release = await releaseRepo.findById(releaseId);
    const mediaAsset = await mediaAssetRepo.findById(release!.mediaAssetId);
    expect(mediaAsset?.availability).toBe("available");
  });

  it("marks the media asset unavailable and fails the download when Telegram no longer has the message", async () => {
    // channel-1 exists in the fixture, but message 9999 does not.
    const releaseId = seedRelease(db, "channel-1", 9999, "Gone.S01E01.1080p.Telegram");

    const releaseRepo = createSqliteReleaseRepository(kysely);
    const mediaAssetRepo = createSqliteMediaAssetRepository(kysely);
    const messageRepo = createSqliteMessageRepository(kysely);
    const downloadRepo = createSqliteDownloadRepository(kysely);
    const telegramAccess = createFakeTelegramAccessAdapter();
    const staging = createFsStagingAdapter(stagingDir);

    const processDownloadClaim = createProcessDownloadClaim({
      releaseRepo,
      mediaAssetRepo,
      messageRepo,
      telegramAccess,
      staging,
      downloadRepo,
      progressReportIntervalMs: 5000,
      leaseDurationMs: 60000,
    });

    const created = await downloadRepo.create({ releaseId, category: null, now: 1000 });
    const claimed = await downloadRepo.claim({ workerId: "w1", now: 1000, leaseDurationMs: 60000 });

    await processDownloadClaim(claimed!, "w1", 2000);

    const finished = await downloadRepo.findById(created.id);
    expect(finished?.observedState).toBe("failed");
    expect(finished?.lastError).toBe("media_unavailable");

    const release = await releaseRepo.findById(releaseId);
    const mediaAsset = await mediaAssetRepo.findById(release!.mediaAssetId);
    expect(mediaAsset?.availability).toBe("unavailable");
  });
});

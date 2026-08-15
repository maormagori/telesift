import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type BetterSqlite3 from "better-sqlite3";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { MediaAssetRepository } from "../../modules/ingestion/ports/media-asset-repository.js";
import { createKyselyDb, openDatabase } from "./connection.js";
import { createSqliteMediaAssetRepository } from "./media-asset-repository.js";
import { applyMigrations, MIGRATIONS_DIR } from "./migrate.js";
import type { DB } from "./schema.js";

describe("sqlite media asset repository", () => {
  let dir: string;
  let db: BetterSqlite3.Database;
  let kysely: Kysely<DB>;
  let repo: MediaAssetRepository;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "telesift-media-assets-"));
    db = openDatabase(path.join(dir, "telesift.sqlite3"));
    kysely = createKyselyDb(db);
    await applyMigrations(kysely, MIGRATIONS_DIR);
    repo = createSqliteMediaAssetRepository(kysely);
    db.prepare(
      "INSERT INTO telegram_chats (telegram_id, title, type, created_at, updated_at) VALUES ('-100123', 'Chat', 'channel', 1, 1)",
    ).run();
  });

  afterEach(async () => {
    await kysely.destroy();
    await rm(dir, { recursive: true, force: true });
  });

  it("findById returns null for an unknown id", async () => {
    expect(await repo.findById(999)).toBeNull();
  });

  it("findById returns the asset for a known id", async () => {
    const message = db
      .prepare(
        "INSERT INTO telegram_messages (chat_id, telegram_message_id, source_date, fingerprint, created_at, updated_at) VALUES ('-100123', 1, 1, 'fp', 1, 1) RETURNING id",
      )
      .get() as { id: number };
    const mediaAsset = db
      .prepare(
        "INSERT INTO media_assets (message_id, file_name, mime_type, created_at, updated_at) VALUES (?, 'video.mp4', 'video/mp4', 1, 1) RETURNING id",
      )
      .get(message.id) as { id: number };

    const found = await repo.findById(mediaAsset.id);
    expect(found).toMatchObject({ id: mediaAsset.id, messageId: message.id, fileName: "video.mp4" });
  });
});

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type BetterSqlite3 from "better-sqlite3";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ContextGroupRepository } from "../../modules/context/ports/context-group-repository.js";
import { createKyselyDb, openDatabase } from "./connection.js";
import { createSqliteContextGroupRepository } from "./context-group-repository.js";
import { applyMigrations, MIGRATIONS_DIR } from "./migrate.js";
import type { DB } from "./schema.js";

function seedMediaAsset(db: BetterSqlite3.Database, telegramMessageId: number): { mediaAssetId: number; messageId: number } {
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
  return { mediaAssetId: mediaAsset.id, messageId: message.id };
}

describe("sqlite context group repository", () => {
  let dir: string;
  let db: BetterSqlite3.Database;
  let kysely: Kysely<DB>;
  let repo: ContextGroupRepository;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "telesift-context-groups-"));
    db = openDatabase(path.join(dir, "telesift.sqlite3"));
    kysely = createKyselyDb(db);
    await applyMigrations(kysely, MIGRATIONS_DIR);
    repo = createSqliteContextGroupRepository(kysely);
  });

  afterEach(async () => {
    await kysely.destroy();
    await rm(dir, { recursive: true, force: true });
  });

  it("upsert creates a new group with its members", async () => {
    const { mediaAssetId, messageId } = seedMediaAsset(db, 1);

    const result = await repo.upsert({
      mediaAssetId,
      status: "closed",
      inputFingerprint: "fp-1",
      quietPeriodDeadline: null,
      members: [{ messageId, role: "target", relativeOrder: 0 }],
      now: 1000,
    });

    expect(result.group).toMatchObject({ mediaAssetId, status: "closed", inputFingerprint: "fp-1" });
    expect(result.members).toEqual([{ messageId, role: "target", relativeOrder: 0 }]);
  });

  it("upsert on the same media asset replaces the group and its members", async () => {
    const { mediaAssetId, messageId } = seedMediaAsset(db, 1);
    const { messageId: precedingId } = seedMediaAsset(db, 2);

    const first = await repo.upsert({
      mediaAssetId,
      status: "open",
      inputFingerprint: "fp-1",
      quietPeriodDeadline: 5000,
      members: [{ messageId, role: "target", relativeOrder: 0 }],
      now: 1000,
    });

    const second = await repo.upsert({
      mediaAssetId,
      status: "closed",
      inputFingerprint: "fp-2",
      quietPeriodDeadline: null,
      members: [
        { messageId, role: "target", relativeOrder: 0 },
        { messageId: precedingId, role: "preceding", relativeOrder: -100 },
      ],
      now: 2000,
    });

    expect(second.group.id).toBe(first.group.id);
    expect(second.group.status).toBe("closed");
    const memberCount = (db.prepare("SELECT COUNT(*) AS n FROM context_group_messages WHERE context_group_id = ?").get(second.group.id) as { n: number }).n;
    expect(memberCount).toBe(2);
  });

  it("getByMediaAssetId returns null when no group exists", async () => {
    expect(await repo.getByMediaAssetId(999)).toBeNull();
  });

  it("getByMediaAssetId returns the group with members ordered by relativeOrder", async () => {
    const { mediaAssetId, messageId } = seedMediaAsset(db, 1);
    const { messageId: precedingId } = seedMediaAsset(db, 2);

    await repo.upsert({
      mediaAssetId,
      status: "closed",
      inputFingerprint: "fp-1",
      quietPeriodDeadline: null,
      members: [
        { messageId, role: "target", relativeOrder: 0 },
        { messageId: precedingId, role: "preceding", relativeOrder: -100 },
      ],
      now: 1000,
    });

    const found = await repo.getByMediaAssetId(mediaAssetId);
    expect(found?.members.map((m) => m.messageId)).toEqual([precedingId, messageId]);
  });
});

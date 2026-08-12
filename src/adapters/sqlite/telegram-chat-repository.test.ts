import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { TelegramChatRepository } from "../../modules/ingestion/ports/telegram-chat-repository.js";
import { createKyselyDb, openDatabase } from "./connection.js";
import { applyMigrations, MIGRATIONS_DIR } from "./migrate.js";
import { createSqliteTelegramChatRepository } from "./telegram-chat-repository.js";
import type { DB } from "./schema.js";

describe("sqlite telegram chat repository", () => {
  let dir: string;
  let kysely: Kysely<DB>;
  let repo: TelegramChatRepository;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "telesift-telegram-chats-"));
    kysely = createKyselyDb(openDatabase(path.join(dir, "telesift.sqlite3")));
    await applyMigrations(kysely, MIGRATIONS_DIR);
    repo = createSqliteTelegramChatRepository(kysely);
  });

  afterEach(async () => {
    await kysely.destroy();
    await rm(dir, { recursive: true, force: true });
  });

  it("upserts a new chat", async () => {
    const chat = await repo.upsert({
      telegramId: "-100123",
      title: "Some Channel",
      type: "channel",
      username: "somechannel",
      now: 1000,
    });

    expect(chat).toEqual({
      telegramId: "-100123",
      title: "Some Channel",
      type: "channel",
      username: "somechannel",
      createdAt: 1000,
      updatedAt: 1000,
    });
  });

  it("upserting the same telegramId again updates title/type/username in place", async () => {
    await repo.upsert({ telegramId: "-100123", title: "Old Title", type: "group", username: null, now: 1000 });
    const updated = await repo.upsert({
      telegramId: "-100123",
      title: "New Title",
      type: "channel",
      username: "newusername",
      now: 2000,
    });

    expect(updated).toMatchObject({ title: "New Title", type: "channel", username: "newusername", createdAt: 1000, updatedAt: 2000 });
    expect(await repo.list()).toHaveLength(1);
  });

  it("findByTelegramId returns null for an unknown id", async () => {
    expect(await repo.findByTelegramId("missing")).toBeNull();
  });

  it("list returns all chats", async () => {
    await repo.upsert({ telegramId: "a", title: "A", type: "channel", username: null, now: 1000 });
    await repo.upsert({ telegramId: "b", title: "B", type: "group", username: null, now: 1000 });

    const chats = await repo.list();
    expect(chats).toHaveLength(2);
    expect(chats.map((c) => c.telegramId).sort()).toEqual(["a", "b"]);
  });
});

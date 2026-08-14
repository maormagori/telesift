import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ChatSyncStateRepository } from "../../modules/ingestion/ports/chat-sync-state-repository.js";
import { createKyselyDb, openDatabase } from "./connection.js";
import { applyMigrations, MIGRATIONS_DIR } from "./migrate.js";
import { createSqliteChatSyncStateRepository } from "./chat-sync-state-repository.js";
import { createSqliteTelegramChatRepository } from "./telegram-chat-repository.js";
import type { DB } from "./schema.js";

describe("sqlite chat sync state repository", () => {
  let dir: string;
  let kysely: Kysely<DB>;
  let repo: ChatSyncStateRepository;
  const chatId = "-100123";

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "telesift-chat-sync-state-"));
    kysely = createKyselyDb(openDatabase(path.join(dir, "telesift.sqlite3")));
    await applyMigrations(kysely, MIGRATIONS_DIR);
    repo = createSqliteChatSyncStateRepository(kysely);
    await createSqliteTelegramChatRepository(kysely).upsert({
      telegramId: chatId,
      title: "Some Channel",
      type: "channel",
      username: null,
      now: 1,
    });
  });

  afterEach(async () => {
    await kysely.destroy();
    await rm(dir, { recursive: true, force: true });
  });

  it("get returns null when no sync-state row exists yet", async () => {
    expect(await repo.get(chatId)).toBeNull();
  });

  it("advanceIncrementalCursor creates the row on first call and moves forward", async () => {
    const first = await repo.advanceIncrementalCursor(chatId, 10, 1000);
    expect(first.newestSeenMessageId).toBe(10);

    const second = await repo.advanceIncrementalCursor(chatId, 20, 2000);
    expect(second.newestSeenMessageId).toBe(20);
  });

  it("advanceIncrementalCursor is a no-op on the cursor value when the new id is not greater", async () => {
    await repo.advanceIncrementalCursor(chatId, 20, 1000);
    const unchanged = await repo.advanceIncrementalCursor(chatId, 5, 2000);

    expect(unchanged.newestSeenMessageId).toBe(20);
  });

  it("advanceBackfillCursor creates the row and moves forward", async () => {
    const first = await repo.advanceBackfillCursor(chatId, 50, 1000);
    expect(first.oldestBackfilledMessageId).toBe(50);

    const second = await repo.advanceBackfillCursor(chatId, 100, 2000);
    expect(second.oldestBackfilledMessageId).toBe(100);
  });

  it("advanceBackfillCursor is a no-op on the cursor value when the new id is not greater", async () => {
    await repo.advanceBackfillCursor(chatId, 90, 1000);
    const unchanged = await repo.advanceBackfillCursor(chatId, 50, 2000);

    expect(unchanged.oldestBackfilledMessageId).toBe(90);
  });

  it("markBackfillCompleted sets backfillCompletedAt", async () => {
    const state = await repo.markBackfillCompleted(chatId, 5000);
    expect(state.backfillCompletedAt).toBe(5000);
  });

  it("recordRescan sets lastRescannedAt", async () => {
    const state = await repo.recordRescan(chatId, 6000);
    expect(state.lastRescannedAt).toBe(6000);
  });

  it("recordError sets lastError and lastErrorAt", async () => {
    const state = await repo.recordError(chatId, "boom", 7000);
    expect(state.lastError).toBe("boom");
    expect(state.lastErrorAt).toBe(7000);
  });
});

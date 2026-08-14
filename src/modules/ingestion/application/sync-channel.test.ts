import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type BetterSqlite3 from "better-sqlite3";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSqliteChannelRepository } from "../../../adapters/sqlite/channel-repository.js";
import { createSqliteChatSyncStateRepository } from "../../../adapters/sqlite/chat-sync-state-repository.js";
import { createKyselyDb, openDatabase } from "../../../adapters/sqlite/connection.js";
import { createSqliteMessageRepository } from "../../../adapters/sqlite/message-repository.js";
import { applyMigrations, MIGRATIONS_DIR } from "../../../adapters/sqlite/migrate.js";
import type { DB } from "../../../adapters/sqlite/schema.js";
import { createSqliteTelegramChatRepository } from "../../../adapters/sqlite/telegram-chat-repository.js";
import { createFakeTelegramAccessAdapter } from "../../../adapters/telegram-fake/fake-telegram-access-adapter.js";
import type { FakeChatFixture } from "../../../adapters/telegram-fake/fixtures.js";
import type { Logger } from "../../../platform/logging/logger.js";
import type { MediaDescriptor, MessageSummary } from "../../telegram-access/ports/models.js";
import type { TelegramAccessPort } from "../../telegram-access/ports/telegram-access-port.js";
import type { Channel } from "../domain/channel.js";
import { createSyncChannelUseCase, type SyncChannelConfig } from "./sync-channel.js";

function makeMessage(chatId: string, messageId: number, overrides: Partial<MessageSummary> = {}): MessageSummary {
  return {
    chatId,
    messageId,
    date: 1_700_000_000 + messageId,
    text: `message ${messageId}`,
    replyToMessageId: null,
    mediaGroupId: null,
    media: null,
    ...overrides,
  };
}

function makeFixture(chatId: string, messageCount: number): FakeChatFixture {
  return {
    chat: { id: chatId, title: `Chat ${chatId}`, type: "channel", username: null },
    messages: Array.from({ length: messageCount }, (_, i) => makeMessage(chatId, i + 1)),
    media: {},
  };
}

const MEDIA_DESCRIPTOR: MediaDescriptor = {
  fileName: "video.mp4",
  mimeType: "video/mp4",
  sizeBytes: 1000,
  durationSeconds: 60,
  width: 1920,
  height: 1080,
};

function createTestLogger(): Logger {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

describe("syncChannel use case", () => {
  let dir: string;
  let db: BetterSqlite3.Database;
  let kysely: Kysely<DB>;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "telesift-sync-channel-"));
    db = openDatabase(path.join(dir, "telesift.sqlite3"));
    kysely = createKyselyDb(db);
    await applyMigrations(kysely, MIGRATIONS_DIR);
  });

  afterEach(async () => {
    await kysely.destroy();
    await rm(dir, { recursive: true, force: true });
  });

  function buildUseCase(
    telegramAccess: TelegramAccessPort,
    logger: Logger,
    configOverrides: Partial<SyncChannelConfig> = {},
  ) {
    return createSyncChannelUseCase({
      telegramAccess,
      telegramChatRepo: createSqliteTelegramChatRepository(kysely),
      chatSyncStateRepo: createSqliteChatSyncStateRepository(kysely),
      messageRepo: createSqliteMessageRepository(kysely),
      logger,
      config: { pageSize: 100, backfillMaxMessages: null, rescanWindowSize: 100, rescanIntervalMs: 1_000, ...configOverrides },
    });
  }

  async function addChannel(chatId: string): Promise<Channel> {
    return createSqliteChannelRepository(kysely).add({ type: "telegram_id", value: chatId });
  }

  function messageCount(): number {
    return (db.prepare("SELECT COUNT(*) AS n FROM telegram_messages").get() as { n: number }).n;
  }

  function jobCount(): number {
    return (db.prepare("SELECT COUNT(*) AS n FROM media_processing_jobs").get() as { n: number }).n;
  }

  it("bootstraps a first-run channel: resolves the chat and seeds cursors", async () => {
    const chatId = "chat-1";
    const fixture = makeFixture(chatId, 2);
    const useCase = buildUseCase(createFakeTelegramAccessAdapter([fixture]), createTestLogger());
    const channel = await addChannel(chatId);

    await useCase.syncChannel(channel, 1000);

    const chat = await createSqliteTelegramChatRepository(kysely).findByTelegramId(chatId);
    expect(chat).not.toBeNull();
    const syncState = await createSqliteChatSyncStateRepository(kysely).get(chatId);
    expect(syncState?.newestSeenMessageId).toBe(2);
    expect(syncState?.backfillCompletedAt).not.toBeNull();
    expect(messageCount()).toBe(2);
  });

  it("drains a multi-page backfill across several ticks until backfillCompletedAt is set", async () => {
    const chatId = "chat-1";
    const fixture = makeFixture(chatId, 250);
    const useCase = buildUseCase(createFakeTelegramAccessAdapter([fixture]), createTestLogger());
    const channel = await addChannel(chatId);
    const syncStateRepo = createSqliteChatSyncStateRepository(kysely);

    await useCase.syncChannel(channel, 1000);
    expect((await syncStateRepo.get(chatId))?.newestSeenMessageId).toBe(100);
    expect((await syncStateRepo.get(chatId))?.backfillCompletedAt).toBeNull();

    await useCase.syncChannel(channel, 2000);
    expect((await syncStateRepo.get(chatId))?.newestSeenMessageId).toBe(200);
    expect((await syncStateRepo.get(chatId))?.backfillCompletedAt).toBeNull();

    await useCase.syncChannel(channel, 3000);
    expect((await syncStateRepo.get(chatId))?.newestSeenMessageId).toBe(250);
    expect((await syncStateRepo.get(chatId))?.backfillCompletedAt).not.toBeNull();
    expect(messageCount()).toBe(250);
  });

  it("completes an empty channel's backfill immediately", async () => {
    const chatId = "chat-1";
    const fixture = makeFixture(chatId, 0);
    const useCase = buildUseCase(createFakeTelegramAccessAdapter([fixture]), createTestLogger());
    const channel = await addChannel(chatId);

    await useCase.syncChannel(channel, 1000);

    const syncState = await createSqliteChatSyncStateRepository(kysely).get(chatId);
    expect(syncState?.backfillCompletedAt).not.toBeNull();
    expect(messageCount()).toBe(0);
  });

  it("picks up newly-posted messages once already caught up", async () => {
    const chatId = "chat-1";
    const fixture = makeFixture(chatId, 2);
    const useCase = buildUseCase(createFakeTelegramAccessAdapter([fixture]), createTestLogger());
    const channel = await addChannel(chatId);

    await useCase.syncChannel(channel, 1000);
    fixture.messages.push(makeMessage(chatId, 3));
    await useCase.syncChannel(channel, 2000);

    expect(messageCount()).toBe(3);
    const message = await createSqliteMessageRepository(kysely).findByChatAndTelegramId(chatId, 3);
    expect(message).not.toBeNull();
  });

  it("re-running a tick with no changes produces no new rows or jobs", async () => {
    const chatId = "chat-1";
    const fixture = makeFixture(chatId, 1);
    fixture.messages[0]!.media = MEDIA_DESCRIPTOR;
    const useCase = buildUseCase(createFakeTelegramAccessAdapter([fixture]), createTestLogger());
    const channel = await addChannel(chatId);

    await useCase.syncChannel(channel, 1000);
    const afterFirst = { messages: messageCount(), jobs: jobCount() };

    await useCase.syncChannel(channel, 5000);
    expect(messageCount()).toBe(afterFirst.messages);
    expect(jobCount()).toBe(afterFirst.jobs);
  });

  it("a rescan tick that mutates a message's text triggers a fingerprint update and a new job", async () => {
    const chatId = "chat-1";
    const fixture = makeFixture(chatId, 1);
    fixture.messages[0]!.media = MEDIA_DESCRIPTOR;
    const useCase = buildUseCase(createFakeTelegramAccessAdapter([fixture]), createTestLogger(), { rescanIntervalMs: 1_000 });
    const channel = await addChannel(chatId);

    await useCase.syncChannel(channel, 1000);
    const jobsBefore = jobCount();

    fixture.messages[0]!.text = "edited caption";
    await useCase.syncChannel(channel, 3000);

    const message = await createSqliteMessageRepository(kysely).findByChatAndTelegramId(chatId, 1);
    expect(message?.text).toBe("edited caption");
    expect(jobCount()).toBe(jobsBefore + 1);
  });

  it("a rescan tick where a message is removed marks it deleted", async () => {
    const chatId = "chat-1";
    const fixture = makeFixture(chatId, 3);
    const useCase = buildUseCase(createFakeTelegramAccessAdapter([fixture]), createTestLogger(), { rescanIntervalMs: 1_000 });
    const channel = await addChannel(chatId);

    await useCase.syncChannel(channel, 1000);
    fixture.messages.splice(1, 1); // remove message id 2
    await useCase.syncChannel(channel, 3000);

    const message = await createSqliteMessageRepository(kysely).findByChatAndTelegramId(chatId, 2);
    expect(message?.deletedAt).not.toBeNull();
  });

  it("logs and skips a channel that isn't visible yet, without throwing", async () => {
    const logger = createTestLogger();
    const useCase = buildUseCase(createFakeTelegramAccessAdapter([]), logger);
    const channel = await addChannel("chat-does-not-exist");

    await expect(useCase.syncChannel(channel, 1000)).resolves.toBeUndefined();

    expect(logger.warn).toHaveBeenCalledOnce();
    expect(await createSqliteTelegramChatRepository(kysely).findByTelegramId("chat-does-not-exist")).toBeNull();
  });

  it("does not let one channel's failure affect another channel's sync", async () => {
    const goodChatId = "chat-good";
    const goodFixture = makeFixture(goodChatId, 1);
    const badChannel = await addChannel("chat-bad");
    const goodChannel = await addChannel(goodChatId);
    const logger = createTestLogger();
    const useCase = buildUseCase(createFakeTelegramAccessAdapter([goodFixture]), logger);

    await useCase.syncChannel(badChannel, 1000);
    await useCase.syncChannel(goodChannel, 1000);

    expect(messageCount()).toBe(1);
  });

  it("resumes from the persisted cursor when re-invoked with fresh adapter/repo instances (restart-safe)", async () => {
    const chatId = "chat-1";
    const fixture = makeFixture(chatId, 150);
    const telegramAccess = createFakeTelegramAccessAdapter([fixture]);
    const getMessagesSpy = vi.spyOn(telegramAccess, "getMessages");
    const channel = await addChannel(chatId);

    await buildUseCase(telegramAccess, createTestLogger()).syncChannel(channel, 1000);
    expect(getMessagesSpy).toHaveBeenCalledWith(chatId, { minId: 0, limit: 100 });

    await buildUseCase(telegramAccess, createTestLogger()).syncChannel(channel, 2000);
    expect(getMessagesSpy).toHaveBeenCalledWith(chatId, { minId: 100, limit: 100 });

    expect(messageCount()).toBe(150);
    const syncState = await createSqliteChatSyncStateRepository(kysely).get(chatId);
    expect(syncState?.backfillCompletedAt).not.toBeNull();
  });
});

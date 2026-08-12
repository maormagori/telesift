import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TelegramMessageNotFoundError } from "../../modules/ingestion/domain/telegram-message.js";
import type { UpsertMessageInput } from "../../modules/ingestion/domain/telegram-message.js";
import type { MessageRepository } from "../../modules/ingestion/ports/message-repository.js";
import { openDatabase } from "./connection.js";
import { applyMigrations } from "./migrate.js";
import { createSqliteMessageRepository } from "./message-repository.js";
import { createSqliteTelegramChatRepository } from "./telegram-chat-repository.js";

const REPO_MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../migrations");

function baseInput(overrides: Partial<UpsertMessageInput> = {}): UpsertMessageInput {
  return {
    chatId: "-100123",
    telegramMessageId: 1,
    text: "hello",
    replyToMessageId: null,
    mediaGroupId: null,
    sourceDate: 1000,
    sourceEditedAt: null,
    media: null,
    now: 1000,
    ...overrides,
  };
}

const mediaInput = {
  fileName: "video.mp4",
  mimeType: "video/mp4",
  sizeBytes: 12345,
  durationSeconds: 60,
  width: 1920,
  height: 1080,
};

describe("sqlite message repository", () => {
  let dir: string;
  let db: DatabaseSync;
  let repo: MessageRepository;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "telesift-messages-"));
    db = openDatabase(path.join(dir, "telesift.sqlite3"));
    applyMigrations(db, REPO_MIGRATIONS_DIR);
    repo = createSqliteMessageRepository(db);
    await createSqliteTelegramChatRepository(db).upsert({
      telegramId: "-100123",
      title: "Some Channel",
      type: "channel",
      username: null,
      now: 1,
    });
  });

  afterEach(async () => {
    db.close();
    await rm(dir, { recursive: true, force: true });
  });

  function counts() {
    return {
      messages: (db.prepare("SELECT COUNT(*) AS n FROM telegram_messages").get() as { n: number }).n,
      mediaAssets: (db.prepare("SELECT COUNT(*) AS n FROM media_assets").get() as { n: number }).n,
      jobs: (db.prepare("SELECT COUNT(*) AS n FROM media_processing_jobs").get() as { n: number }).n,
    };
  }

  it("inserts a new message", async () => {
    const result = await repo.upsertMessage(baseInput());

    expect(result.contentChanged).toBe(true);
    expect(result.jobEnqueued).toBe(false);
    expect(result.message).toMatchObject({ chatId: "-100123", telegramMessageId: 1, text: "hello" });
    expect(result.mediaAsset).toBeNull();
  });

  it("duplicate input: re-upserting identical input twice is a no-op on the second call", async () => {
    await repo.upsertMessage(baseInput({ media: mediaInput }));
    const second = await repo.upsertMessage(baseInput({ media: mediaInput }));

    expect(second.contentChanged).toBe(false);
    expect(second.jobEnqueued).toBe(false);
    expect(counts()).toEqual({ messages: 1, mediaAssets: 1, jobs: 1 });
  });

  it("upserting the same (chatId, telegramMessageId) with different text updates in place", async () => {
    await repo.upsertMessage(baseInput({ text: "first" }));
    const result = await repo.upsertMessage(baseInput({ text: "second", now: 2000 }));

    expect(result.contentChanged).toBe(true);
    expect(result.message.text).toBe("second");
    expect(counts().messages).toBe(1);
  });

  it("enqueues a pending job when media is present and content changed", async () => {
    const result = await repo.upsertMessage(baseInput({ media: mediaInput }));

    expect(result.jobEnqueued).toBe(true);
    const job = db.prepare("SELECT status, media_asset_id FROM media_processing_jobs").get() as {
      status: string;
      media_asset_id: number;
    };
    expect(job.status).toBe("pending");
    expect(job.media_asset_id).toBe(result.mediaAsset?.id);
  });

  it("never enqueues a job when no media is present, even if content changed", async () => {
    await repo.upsertMessage(baseInput({ text: "first" }));
    const result = await repo.upsertMessage(baseInput({ text: "second", now: 2000 }));

    expect(result.contentChanged).toBe(true);
    expect(result.jobEnqueued).toBe(false);
    expect(counts().jobs).toBe(0);
  });

  it("different media metadata on a later upsert produces a second distinct job row", async () => {
    const first = await repo.upsertMessage(baseInput({ media: mediaInput }));
    const second = await repo.upsertMessage(baseInput({ media: { ...mediaInput, sizeBytes: 99999 }, now: 2000 }));

    expect(second.jobEnqueued).toBe(true);
    expect(counts().jobs).toBe(2);
    const jobs = db.prepare("SELECT media_asset_id FROM media_processing_jobs").all() as { media_asset_id: number }[];
    expect(jobs.every((j) => j.media_asset_id === first.mediaAsset?.id)).toBe(true);
  });

  it("findByChatAndTelegramId returns null for unknown, the row otherwise", async () => {
    expect(await repo.findByChatAndTelegramId("-100123", 999)).toBeNull();

    await repo.upsertMessage(baseInput());
    const found = await repo.findByChatAndTelegramId("-100123", 1);
    expect(found?.text).toBe("hello");
  });

  it("markDeleted sets deletedAt without removing the row", async () => {
    await repo.upsertMessage(baseInput());
    const deleted = await repo.markDeleted("-100123", 1, 5000);

    expect(deleted.deletedAt).toBe(5000);
    expect(counts().messages).toBe(1);
  });

  it("markDeleted throws TelegramMessageNotFoundError for an unknown message", async () => {
    await expect(repo.markDeleted("-100123", 999, 5000)).rejects.toThrow(TelegramMessageNotFoundError);
  });

  it("inserting a message for a chat_id with no telegram_chats row throws", async () => {
    await expect(repo.upsertMessage(baseInput({ chatId: "unknown-chat" }))).rejects.toThrow();
  });
});

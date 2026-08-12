import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { MediaProcessingJobRepository } from "../../modules/extraction/ports/media-processing-job-repository.js";
import { openDatabase } from "./connection.js";
import { applyMigrations } from "./migrate.js";
import { createSqliteMediaProcessingJobRepository } from "./media-processing-job-repository.js";

const REPO_MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../migrations");

function seedMediaAsset(db: DatabaseSync, telegramMessageId: number): number {
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
  return mediaAsset.id;
}

describe("sqlite media processing job repository", () => {
  let dir: string;
  let db: DatabaseSync;
  let repo: MediaProcessingJobRepository;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "telesift-media-jobs-"));
    db = openDatabase(path.join(dir, "telesift.sqlite3"));
    applyMigrations(db, REPO_MIGRATIONS_DIR);
    repo = createSqliteMediaProcessingJobRepository(db);
  });

  afterEach(async () => {
    db.close();
    await rm(dir, { recursive: true, force: true });
  });

  it("enqueue inserts a new pending job", async () => {
    const mediaAssetId = seedMediaAsset(db, 1);
    const job = await repo.enqueue({ mediaAssetId, inputFingerprint: "fp-1", availableAt: 1000, now: 1000 });

    expect(job).toMatchObject({ mediaAssetId, inputFingerprint: "fp-1", status: "pending", attempts: 0 });
  });

  it("enqueue called twice with the same (mediaAssetId, inputFingerprint) inserts only one row", async () => {
    const mediaAssetId = seedMediaAsset(db, 1);
    const first = await repo.enqueue({ mediaAssetId, inputFingerprint: "fp-1", availableAt: 1000, now: 1000 });
    const second = await repo.enqueue({ mediaAssetId, inputFingerprint: "fp-1", availableAt: 2000, now: 2000 });

    expect(second.id).toBe(first.id);
    const count = (db.prepare("SELECT COUNT(*) AS n FROM media_processing_jobs").get() as { n: number }).n;
    expect(count).toBe(1);
  });

  it("claim returns null when nothing eligible", async () => {
    expect(await repo.claim({ workerId: "w1", now: 1000, leaseDurationMs: 5000 })).toBeNull();

    const mediaAssetId = seedMediaAsset(db, 1);
    await repo.enqueue({ mediaAssetId, inputFingerprint: "fp-1", availableAt: 5000, now: 1000 });
    expect(await repo.claim({ workerId: "w1", now: 1000, leaseDurationMs: 5000 })).toBeNull();
  });

  it("claim picks the oldest eligible job first among several pending", async () => {
    const asset1 = seedMediaAsset(db, 1);
    const asset2 = seedMediaAsset(db, 2);
    await repo.enqueue({ mediaAssetId: asset1, inputFingerprint: "fp-1", availableAt: 2000, now: 1000 });
    await repo.enqueue({ mediaAssetId: asset2, inputFingerprint: "fp-2", availableAt: 1000, now: 1000 });

    const claimed = await repo.claim({ workerId: "w1", now: 3000, leaseDurationMs: 5000 });
    expect(claimed?.mediaAssetId).toBe(asset2);
  });

  it("a claimed job is invisible to an immediate second claim", async () => {
    const mediaAssetId = seedMediaAsset(db, 1);
    await repo.enqueue({ mediaAssetId, inputFingerprint: "fp-1", availableAt: 1000, now: 1000 });

    const first = await repo.claim({ workerId: "w1", now: 1000, leaseDurationMs: 5000 });
    const second = await repo.claim({ workerId: "w2", now: 1000, leaseDurationMs: 5000 });

    expect(first).not.toBeNull();
    expect(second).toBeNull();
  });

  it("lease expiry: a different worker can reclaim a job once its lease has expired", async () => {
    const mediaAssetId = seedMediaAsset(db, 1);
    await repo.enqueue({ mediaAssetId, inputFingerprint: "fp-1", availableAt: 1000, now: 1000 });

    const claimedByA = await repo.claim({ workerId: "workerA", now: 1000, leaseDurationMs: 1000 });
    expect(claimedByA?.workerId).toBe("workerA");
    expect(claimedByA?.attempts).toBe(1);

    const beforeExpiry = await repo.claim({ workerId: "workerB", now: 1500, leaseDurationMs: 1000 });
    expect(beforeExpiry).toBeNull();

    const afterExpiry = await repo.claim({ workerId: "workerB", now: 2500, leaseDurationMs: 1000 });
    expect(afterExpiry?.id).toBe(claimedByA?.id);
    expect(afterExpiry?.workerId).toBe("workerB");
    expect(afterExpiry?.attempts).toBe(2);
  });

  it("complete clears state on a held claim and returns true", async () => {
    const mediaAssetId = seedMediaAsset(db, 1);
    await repo.enqueue({ mediaAssetId, inputFingerprint: "fp-1", availableAt: 1000, now: 1000 });
    const claimed = await repo.claim({ workerId: "w1", now: 1000, leaseDurationMs: 5000 });

    const result = await repo.complete(claimed!.id, "w1", 2000);

    expect(result).toBe(true);
    const row = db.prepare("SELECT status, worker_id, lease_expires_at FROM media_processing_jobs WHERE id = ?").get(claimed!.id) as {
      status: string;
      worker_id: string | null;
      lease_expires_at: number | null;
    };
    expect(row).toEqual({ status: "completed", worker_id: null, lease_expires_at: null });
  });

  it("complete on an already-reclaimed job returns false", async () => {
    const mediaAssetId = seedMediaAsset(db, 1);
    await repo.enqueue({ mediaAssetId, inputFingerprint: "fp-1", availableAt: 1000, now: 1000 });
    const claimed = await repo.claim({ workerId: "workerA", now: 1000, leaseDurationMs: 1000 });
    await repo.claim({ workerId: "workerB", now: 2500, leaseDurationMs: 1000 });

    const result = await repo.complete(claimed!.id, "workerA", 3000);

    expect(result).toBe(false);
    const row = db.prepare("SELECT status, worker_id FROM media_processing_jobs WHERE id = ?").get(claimed!.id) as {
      status: string;
      worker_id: string | null;
    };
    expect(row).toEqual({ status: "processing", worker_id: "workerB" });
  });

  it("fail with retryAt returns the job to pending at that time and preserves attempts", async () => {
    const mediaAssetId = seedMediaAsset(db, 1);
    await repo.enqueue({ mediaAssetId, inputFingerprint: "fp-1", availableAt: 1000, now: 1000 });
    const claimed = await repo.claim({ workerId: "w1", now: 1000, leaseDurationMs: 5000 });

    const result = await repo.fail(claimed!.id, "w1", { error: "transient", now: 2000, retryAt: 9000 });

    expect(result).toBe(true);
    const row = db
      .prepare("SELECT status, available_at, attempts, last_error FROM media_processing_jobs WHERE id = ?")
      .get(claimed!.id) as { status: string; available_at: number; attempts: number; last_error: string };
    expect(row).toEqual({ status: "pending", available_at: 9000, attempts: 1, last_error: "transient" });
  });

  it("fail without retryAt is terminal and never resurfaces via claim", async () => {
    const mediaAssetId = seedMediaAsset(db, 1);
    await repo.enqueue({ mediaAssetId, inputFingerprint: "fp-1", availableAt: 1000, now: 1000 });
    const claimed = await repo.claim({ workerId: "w1", now: 1000, leaseDurationMs: 5000 });

    await repo.fail(claimed!.id, "w1", { error: "permanent", now: 2000 });

    const status = (db.prepare("SELECT status FROM media_processing_jobs WHERE id = ?").get(claimed!.id) as { status: string })
      .status;
    expect(status).toBe("failed");
    expect(await repo.claim({ workerId: "w2", now: 100000, leaseDurationMs: 5000 })).toBeNull();
  });

  it("fail on an already-reclaimed job returns false", async () => {
    const mediaAssetId = seedMediaAsset(db, 1);
    await repo.enqueue({ mediaAssetId, inputFingerprint: "fp-1", availableAt: 1000, now: 1000 });
    const claimed = await repo.claim({ workerId: "workerA", now: 1000, leaseDurationMs: 1000 });
    await repo.claim({ workerId: "workerB", now: 2500, leaseDurationMs: 1000 });

    const result = await repo.fail(claimed!.id, "workerA", { error: "too late", now: 3000 });

    expect(result).toBe(false);
  });
});

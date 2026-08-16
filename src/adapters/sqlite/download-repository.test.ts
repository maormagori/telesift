import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type BetterSqlite3 from "better-sqlite3";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { releaseIdToBtih } from "../../modules/catalog/domain/release-magnet.js";
import type { DownloadRepository } from "../../modules/downloads/ports/download-repository.js";
import { createKyselyDb, openDatabase } from "./connection.js";
import { createSqliteDownloadRepository } from "./download-repository.js";
import { applyMigrations, MIGRATIONS_DIR } from "./migrate.js";
import type { DB } from "./schema.js";

function seedRelease(db: BetterSqlite3.Database, telegramMessageId: number): number {
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
      "INSERT INTO releases (media_asset_id, extraction_run_id, display_title, created_at, updated_at) VALUES (?, ?, 'Release', 1, 1) RETURNING id",
    )
    .get(mediaAsset.id, run.id) as { id: number };
  return release.id;
}

describe("sqlite download repository", () => {
  let dir: string;
  let db: BetterSqlite3.Database;
  let kysely: Kysely<DB>;
  let repo: DownloadRepository;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "telesift-downloads-"));
    db = openDatabase(path.join(dir, "telesift.sqlite3"));
    kysely = createKyselyDb(db);
    await applyMigrations(kysely, MIGRATIONS_DIR);
    repo = createSqliteDownloadRepository(kysely);
  });

  afterEach(async () => {
    await kysely.destroy();
    await rm(dir, { recursive: true, force: true });
  });

  it("create inserts a queued download keyed on the release's client hash", async () => {
    const releaseId = seedRelease(db, 1);
    const download = await repo.create({ releaseId, category: null, now: 1000 });

    expect(download).toMatchObject({
      releaseId,
      clientHash: releaseIdToBtih(releaseId),
      desiredState: "queued",
      observedState: "queued",
      progressBytes: 0,
      attempts: 0,
    });
  });

  it("create is idempotent for an active download on the same release", async () => {
    const releaseId = seedRelease(db, 1);
    const first = await repo.create({ releaseId, category: null, now: 1000 });
    const second = await repo.create({ releaseId, category: "tv", now: 2000 });

    expect(second.id).toBe(first.id);
    const count = (db.prepare("SELECT COUNT(*) AS n FROM downloads").get() as { n: number }).n;
    expect(count).toBe(1);
  });

  it("create starts a new row, sharing the client hash, once the previous attempt is terminal", async () => {
    const releaseId = seedRelease(db, 1);
    const first = await repo.create({ releaseId, category: null, now: 1000 });
    const claimed = await repo.claim({ workerId: "w1", now: 1000, leaseDurationMs: 5000 });
    await repo.fail(claimed!.id, "w1", "boom", 2000);

    const second = await repo.create({ releaseId, category: null, now: 3000 });

    expect(second.id).not.toBe(first.id);
    expect(second.clientHash).toBe(first.clientHash);
  });

  it("claim returns null when nothing eligible", async () => {
    expect(await repo.claim({ workerId: "w1", now: 1000, leaseDurationMs: 5000 })).toBeNull();
  });

  it("a claimed download is invisible to an immediate second claim", async () => {
    const releaseId = seedRelease(db, 1);
    await repo.create({ releaseId, category: null, now: 1000 });

    const first = await repo.claim({ workerId: "w1", now: 1000, leaseDurationMs: 5000 });
    const second = await repo.claim({ workerId: "w2", now: 1000, leaseDurationMs: 5000 });

    expect(first?.observedState).toBe("verifying");
    expect(first?.attempts).toBe(1);
    expect(second).toBeNull();
  });

  it("lease expiry: a different worker can reclaim once the lease has expired", async () => {
    const releaseId = seedRelease(db, 1);
    await repo.create({ releaseId, category: null, now: 1000 });

    const claimedByA = await repo.claim({ workerId: "workerA", now: 1000, leaseDurationMs: 1000 });
    expect(claimedByA?.workerId).toBe("workerA");

    const beforeExpiry = await repo.claim({ workerId: "workerB", now: 1500, leaseDurationMs: 1000 });
    expect(beforeExpiry).toBeNull();

    const afterExpiry = await repo.claim({ workerId: "workerB", now: 2500, leaseDurationMs: 1000 });
    expect(afterExpiry?.id).toBe(claimedByA?.id);
    expect(afterExpiry?.workerId).toBe("workerB");
    expect(afterExpiry?.attempts).toBe(2);
  });

  it("claim skips a download that is paused with no resume requested", async () => {
    const releaseId = seedRelease(db, 1);
    await repo.create({ releaseId, category: null, now: 1000 });
    const claimed = await repo.claim({ workerId: "w1", now: 1000, leaseDurationMs: 5000 });
    // Mirrors the real flow: the app requests a pause (desiredState), then the
    // worker reconciles it into observedState on its next claim.
    await repo.requestDesiredState(claimed!.id, "paused", 1500);
    await repo.pause(claimed!.id, "w1", 500, 2000);

    expect(await repo.claim({ workerId: "w2", now: 3000, leaseDurationMs: 5000 })).toBeNull();
  });

  it("claim picks up a paused download once resume is requested, preserving its progress", async () => {
    const releaseId = seedRelease(db, 1);
    await repo.create({ releaseId, category: null, now: 1000 });
    const claimed = await repo.claim({ workerId: "w1", now: 1000, leaseDurationMs: 5000 });
    await repo.requestDesiredState(claimed!.id, "paused", 1500);
    await repo.pause(claimed!.id, "w1", 500, 2000);
    await repo.requestDesiredState(claimed!.id, "queued", 3000);

    const resumed = await repo.claim({ workerId: "w2", now: 4000, leaseDurationMs: 5000 });

    expect(resumed?.id).toBe(claimed!.id);
    expect(resumed?.progressBytes).toBe(500);
  });

  it("reportProgress persists progress, renews the lease, and returns the current desired state", async () => {
    const releaseId = seedRelease(db, 1);
    await repo.create({ releaseId, category: null, now: 1000 });
    const claimed = await repo.claim({ workerId: "w1", now: 1000, leaseDurationMs: 1000 });

    const desiredState = await repo.reportProgress(claimed!.id, "w1", {
      progressBytes: 100,
      totalBytes: 1000,
      stagingPath: "/staging/1-file",
      now: 2000,
      leaseDurationMs: 5000,
    });

    expect(desiredState).toBe("queued");
    const row = db
      .prepare("SELECT progress_bytes, total_bytes, observed_state, staging_path, lease_expires_at FROM downloads WHERE id = ?")
      .get(claimed!.id) as {
      progress_bytes: number;
      total_bytes: number | null;
      observed_state: string;
      staging_path: string | null;
      lease_expires_at: number | null;
    };
    expect(row).toEqual({
      progress_bytes: 100,
      total_bytes: 1000,
      observed_state: "downloading",
      staging_path: "/staging/1-file",
      lease_expires_at: 7000,
    });
  });

  it("reportProgress preserves a known totalBytes across a later call that passes null", async () => {
    const releaseId = seedRelease(db, 1);
    await repo.create({ releaseId, category: null, now: 1000 });
    const claimed = await repo.claim({ workerId: "w1", now: 1000, leaseDurationMs: 5000 });

    await repo.reportProgress(claimed!.id, "w1", {
      progressBytes: 100,
      totalBytes: 1000,
      stagingPath: "/p",
      now: 2000,
      leaseDurationMs: 5000,
    });
    await repo.reportProgress(claimed!.id, "w1", {
      progressBytes: 200,
      totalBytes: null,
      stagingPath: "/p",
      now: 3000,
      leaseDurationMs: 5000,
    });

    const download = await repo.findById(claimed!.id);
    expect(download?.totalBytes).toBe(1000);
    expect(download?.progressBytes).toBe(200);
  });

  it("reportProgress returns null once the lease has been reclaimed by another worker", async () => {
    const releaseId = seedRelease(db, 1);
    await repo.create({ releaseId, category: null, now: 1000 });
    const claimed = await repo.claim({ workerId: "workerA", now: 1000, leaseDurationMs: 1000 });
    await repo.claim({ workerId: "workerB", now: 2500, leaseDurationMs: 1000 });

    const desiredState = await repo.reportProgress(claimed!.id, "workerA", {
      progressBytes: 100,
      totalBytes: 1000,
      stagingPath: "/staging/1-file",
      now: 3000,
      leaseDurationMs: 5000,
    });

    expect(desiredState).toBeNull();
  });

  it("pause/cancel/complete/fail all guard on worker ownership", async () => {
    const releaseId = seedRelease(db, 1);
    await repo.create({ releaseId, category: null, now: 1000 });
    const claimed = await repo.claim({ workerId: "workerA", now: 1000, leaseDurationMs: 1000 });
    await repo.claim({ workerId: "workerB", now: 2500, leaseDurationMs: 1000 });

    expect(await repo.pause(claimed!.id, "workerA", 10, 3000)).toBe(false);
    expect(await repo.cancel(claimed!.id, "workerA", 3000)).toBe(false);
    expect(await repo.complete(claimed!.id, "workerA", "/p", 10, 3000)).toBe(false);
    expect(await repo.fail(claimed!.id, "workerA", "boom", 3000)).toBe(false);
  });

  it("complete clears the lease and stamps completedAt", async () => {
    const releaseId = seedRelease(db, 1);
    await repo.create({ releaseId, category: null, now: 1000 });
    const claimed = await repo.claim({ workerId: "w1", now: 1000, leaseDurationMs: 5000 });

    const result = await repo.complete(claimed!.id, "w1", "/staging/1-file", 5000, 4000);

    expect(result).toBe(true);
    expect(await repo.findById(claimed!.id)).toMatchObject({
      observedState: "completed",
      stagingPath: "/staging/1-file",
      progressBytes: 5000,
      totalBytes: 5000,
      workerId: null,
      leaseExpiresAt: null,
      completedAt: 4000,
    });
  });

  it("findLatestByClientHash resolves the newest row sharing a release's hash", async () => {
    const releaseId = seedRelease(db, 1);
    const first = await repo.create({ releaseId, category: null, now: 1000 });
    const claimed = await repo.claim({ workerId: "w1", now: 1000, leaseDurationMs: 5000 });
    await repo.fail(claimed!.id, "w1", "boom", 2000);
    const second = await repo.create({ releaseId, category: null, now: 3000 });

    const found = await repo.findLatestByClientHash(first.clientHash);
    expect(found?.id).toBe(second.id);
  });

  it("listActive excludes canceled downloads and filters by category", async () => {
    const releaseA = seedRelease(db, 1);
    const releaseB = seedRelease(db, 2);
    const a = await repo.create({ releaseId: releaseA, category: "tv", now: 1000 });
    const b = await repo.create({ releaseId: releaseB, category: "movies", now: 1000 });
    await repo.requestDesiredState(a.id, "canceled", 2000);
    const claimedA = await repo.claim({ workerId: "w1", now: 2000, leaseDurationMs: 5000 });
    await repo.cancel(claimedA!.id, "w1", 2000);

    expect((await repo.listActive()).map((d) => d.id)).toEqual([b.id]);
    expect((await repo.listActive("movies")).map((d) => d.id)).toEqual([b.id]);
    expect((await repo.listActive("tv")).map((d) => d.id)).toEqual([]);
  });

  it("requestDesiredState changes desiredState without touching the worker's lease", async () => {
    const releaseId = seedRelease(db, 1);
    await repo.create({ releaseId, category: null, now: 1000 });
    const claimed = await repo.claim({ workerId: "w1", now: 1000, leaseDurationMs: 5000 });

    const updated = await repo.requestDesiredState(claimed!.id, "paused", 2000);

    expect(updated?.desiredState).toBe("paused");
    expect(updated?.workerId).toBe("w1");
    expect(updated?.observedState).toBe("verifying");
  });
});

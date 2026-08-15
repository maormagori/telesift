import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type BetterSqlite3 from "better-sqlite3";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ExtractionRunRepository } from "../../modules/extraction/ports/extraction-run-repository.js";
import { createKyselyDb, openDatabase } from "./connection.js";
import { createSqliteExtractionRunRepository } from "./extraction-run-repository.js";
import { applyMigrations, MIGRATIONS_DIR } from "./migrate.js";
import type { DB } from "./schema.js";

function seedContextGroup(db: BetterSqlite3.Database): number {
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
  return group.id;
}

const VERSIONS = { pipelineVersion: "p1", promptVersion: "pr1", modelVersion: "m1" };

describe("sqlite extraction run repository", () => {
  let dir: string;
  let db: BetterSqlite3.Database;
  let kysely: Kysely<DB>;
  let repo: ExtractionRunRepository;
  let contextGroupId: number;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "telesift-extraction-runs-"));
    db = openDatabase(path.join(dir, "telesift.sqlite3"));
    kysely = createKyselyDb(db);
    await applyMigrations(kysely, MIGRATIONS_DIR);
    repo = createSqliteExtractionRunRepository(kysely);
    contextGroupId = seedContextGroup(db);
  });

  afterEach(async () => {
    await kysely.destroy();
    await rm(dir, { recursive: true, force: true });
  });

  it("findByKey returns null when no run exists", async () => {
    expect(await repo.findByKey({ contextGroupId, inputFingerprint: "fp-1", ...VERSIONS })).toBeNull();
  });

  it("insert then findByKey returns the same run (the idempotency check the job handler relies on)", async () => {
    const inserted = await repo.insert({
      contextGroupId,
      inputFingerprint: "fp-1",
      ...VERSIONS,
      status: "succeeded",
      isTvEpisode: true,
      resultJson: JSON.stringify({ isTvEpisode: true }),
      error: null,
      now: 1000,
    });

    const found = await repo.findByKey({ contextGroupId, inputFingerprint: "fp-1", ...VERSIONS });
    expect(found).toEqual(inserted);
  });

  it("findByKey is scoped to the exact pipeline/prompt/model version combination", async () => {
    await repo.insert({
      contextGroupId,
      inputFingerprint: "fp-1",
      ...VERSIONS,
      status: "succeeded",
      isTvEpisode: true,
      resultJson: "{}",
      error: null,
      now: 1000,
    });

    expect(
      await repo.findByKey({ contextGroupId, inputFingerprint: "fp-1", ...VERSIONS, promptVersion: "pr2" }),
    ).toBeNull();
  });

  it("records a failed run with isTvEpisode null and an error message", async () => {
    const run = await repo.insert({
      contextGroupId,
      inputFingerprint: "fp-1",
      ...VERSIONS,
      status: "failed",
      isTvEpisode: null,
      resultJson: null,
      error: "schema validation failed",
      now: 1000,
    });

    expect(run.status).toBe("failed");
    expect(run.isTvEpisode).toBeNull();
    expect(run.error).toBe("schema validation failed");
  });

  it("dedups a negative (isTvEpisode: false) classification the same as a positive one", async () => {
    const inserted = await repo.insert({
      contextGroupId,
      inputFingerprint: "fp-1",
      ...VERSIONS,
      status: "succeeded",
      isTvEpisode: false,
      resultJson: JSON.stringify({ isTvEpisode: false }),
      error: null,
      now: 1000,
    });

    const found = await repo.findByKey({ contextGroupId, inputFingerprint: "fp-1", ...VERSIONS });
    expect(found?.isTvEpisode).toBe(false);
    expect(found?.id).toBe(inserted.id);
  });

  it("rejects a duplicate insert for the same dedup key (immutability enforced at the DB layer)", async () => {
    await repo.insert({
      contextGroupId,
      inputFingerprint: "fp-1",
      ...VERSIONS,
      status: "succeeded",
      isTvEpisode: true,
      resultJson: "{}",
      error: null,
      now: 1000,
    });

    await expect(
      repo.insert({
        contextGroupId,
        inputFingerprint: "fp-1",
        ...VERSIONS,
        status: "succeeded",
        isTvEpisode: true,
        resultJson: "{}",
        error: null,
        now: 2000,
      }),
    ).rejects.toThrow();
  });
});

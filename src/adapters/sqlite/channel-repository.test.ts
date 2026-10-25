import { promises as fs } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { sql, type Kysely } from "kysely";
import { FileMigrationProvider, Migrator } from "kysely/migration";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ChannelNotFoundError, DEFAULT_BACKFILL_POLICY } from "../../modules/ingestion/domain/channel.js";
import type { ChannelRepository } from "../../modules/ingestion/ports/channel-repository.js";
import { createKyselyDb, openDatabase } from "./connection.js";
import { applyMigrations, MIGRATIONS_DIR } from "./migrate.js";
import { createSqliteChannelRepository } from "./channel-repository.js";
import type { DB } from "./schema.js";

describe("sqlite channel repository", () => {
  let dir: string;
  let kysely: Kysely<DB>;
  let repo: ChannelRepository;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "telesift-channels-"));
    kysely = createKyselyDb(openDatabase(path.join(dir, "telesift.sqlite3")));
    await applyMigrations(kysely, MIGRATIONS_DIR);
    repo = createSqliteChannelRepository(kysely);
  });

  afterEach(async () => {
    await kysely.destroy();
    await rm(dir, { recursive: true, force: true });
  });

  it("adds a channel by telegram id, defaulting to enabled", async () => {
    const channel = await repo.add({ type: "telegram_id", value: "-1001234567890" }, DEFAULT_BACKFILL_POLICY);

    expect(channel).toMatchObject({
      identifier: { type: "telegram_id", value: "-1001234567890" },
      enabled: true,
    });
  });

  it("adds a channel by username", async () => {
    const channel = await repo.add({ type: "username", value: "somechannel" }, DEFAULT_BACKFILL_POLICY);

    expect(channel).toMatchObject({ identifier: { type: "username", value: "somechannel" }, enabled: true });
  });

  it("adding the same identifier twice is idempotent", async () => {
    const identifier = { type: "username" as const, value: "somechannel" };

    const first = await repo.add(identifier, DEFAULT_BACKFILL_POLICY);
    const second = await repo.add(identifier, DEFAULT_BACKFILL_POLICY);

    expect(second).toEqual(first);
    expect(await repo.list()).toHaveLength(1);
  });

  it("stores the backfill policy given at add time", async () => {
    const limited = await repo.add({ type: "username", value: "limited" }, { enabled: true, maxMessages: 250 });
    const newOnly = await repo.add({ type: "username", value: "newonly" }, { enabled: false, maxMessages: null });

    expect(limited.backfillPolicy).toEqual({ enabled: true, maxMessages: 250 });
    expect(newOnly.backfillPolicy).toEqual({ enabled: false, maxMessages: null });
    expect((await repo.list()).map((channel) => channel.backfillPolicy)).toEqual([
      { enabled: true, maxMessages: 250 },
      { enabled: false, maxMessages: null },
    ]);
  });

  it("re-adding an existing identifier keeps its original backfill policy", async () => {
    const identifier = { type: "username" as const, value: "somechannel" };
    await repo.add(identifier, { enabled: true, maxMessages: 250 });

    const again = await repo.add(identifier, { enabled: false, maxMessages: null });

    expect(again.backfillPolicy).toEqual({ enabled: true, maxMessages: 250 });
  });

  it("gives channels created before the backfill-policy migration the default policy", async () => {
    const legacy = createKyselyDb(openDatabase(path.join(dir, "legacy.sqlite3")));
    try {
      const migrator = new Migrator({
        db: legacy,
        provider: new FileMigrationProvider({ fs, path, migrationFolder: MIGRATIONS_DIR }),
      });
      await migrator.migrateTo("0013_add_release_search_index");
      await sql`INSERT INTO channels (identifier_type, identifier_value, enabled, created_at, updated_at)
        VALUES ('username', 'legacychannel', 1, 1, 1)`.execute(legacy);

      const { error } = await migrator.migrateToLatest();
      expect(error).toBeUndefined();

      const [channel] = await createSqliteChannelRepository(legacy).list();
      expect(channel?.backfillPolicy).toEqual(DEFAULT_BACKFILL_POLICY);
    } finally {
      await legacy.destroy();
    }
  });

  it("disables and re-enables a channel without removing the row", async () => {
    const identifier = { type: "username" as const, value: "somechannel" };
    await repo.add(identifier, DEFAULT_BACKFILL_POLICY);

    const disabled = await repo.setEnabled(identifier, false);
    expect(disabled.enabled).toBe(false);
    expect(await repo.list()).toHaveLength(1);

    const reenabled = await repo.setEnabled(identifier, true);
    expect(reenabled.enabled).toBe(true);
  });

  it("throws ChannelNotFoundError when enabling an unknown channel", async () => {
    await expect(repo.setEnabled({ type: "username", value: "missing" }, true)).rejects.toThrow(
      ChannelNotFoundError,
    );
  });

  it("lists all channels with their enabled state", async () => {
    await repo.add({ type: "username", value: "a" }, DEFAULT_BACKFILL_POLICY);
    const b = await repo.add({ type: "telegram_id", value: "1" }, DEFAULT_BACKFILL_POLICY);
    await repo.setEnabled(b.identifier, false);

    const channels = await repo.list();
    expect(channels).toHaveLength(2);
    expect(channels.find((c) => c.identifier.value === "a")?.enabled).toBe(true);
    expect(channels.find((c) => c.identifier.value === "1")?.enabled).toBe(false);
  });
});

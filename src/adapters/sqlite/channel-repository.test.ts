import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ChannelNotFoundError } from "../../modules/ingestion/domain/channel.js";
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
    const channel = await repo.add({ type: "telegram_id", value: "-1001234567890" });

    expect(channel).toMatchObject({
      identifier: { type: "telegram_id", value: "-1001234567890" },
      enabled: true,
    });
  });

  it("adds a channel by username", async () => {
    const channel = await repo.add({ type: "username", value: "somechannel" });

    expect(channel).toMatchObject({ identifier: { type: "username", value: "somechannel" }, enabled: true });
  });

  it("adding the same identifier twice is idempotent", async () => {
    const identifier = { type: "username" as const, value: "somechannel" };

    const first = await repo.add(identifier);
    const second = await repo.add(identifier);

    expect(second).toEqual(first);
    expect(await repo.list()).toHaveLength(1);
  });

  it("disables and re-enables a channel without removing the row", async () => {
    const identifier = { type: "username" as const, value: "somechannel" };
    await repo.add(identifier);

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
    await repo.add({ type: "username", value: "a" });
    const b = await repo.add({ type: "telegram_id", value: "1" });
    await repo.setEnabled(b.identifier, false);

    const channels = await repo.list();
    expect(channels).toHaveLength(2);
    expect(channels.find((c) => c.identifier.value === "a")?.enabled).toBe(true);
    expect(channels.find((c) => c.identifier.value === "1")?.enabled).toBe(false);
  });
});

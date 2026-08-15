import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type BetterSqlite3 from "better-sqlite3";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SeriesRepository } from "../../modules/catalog/ports/series-repository.js";
import { createKyselyDb, openDatabase } from "./connection.js";
import { applyMigrations, MIGRATIONS_DIR } from "./migrate.js";
import type { DB } from "./schema.js";
import { createSqliteSeriesRepository } from "./series-repository.js";

describe("sqlite series repository", () => {
  let dir: string;
  let db: BetterSqlite3.Database;
  let kysely: Kysely<DB>;
  let repo: SeriesRepository;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "telesift-series-"));
    db = openDatabase(path.join(dir, "telesift.sqlite3"));
    kysely = createKyselyDb(db);
    await applyMigrations(kysely, MIGRATIONS_DIR);
    repo = createSqliteSeriesRepository(kysely);
  });

  afterEach(async () => {
    await kysely.destroy();
    await rm(dir, { recursive: true, force: true });
  });

  it("findById returns null for an unknown id", async () => {
    expect(await repo.findById(999)).toBeNull();
  });

  it("create then findById returns the same series", async () => {
    const created = await repo.create({ canonicalTitle: "Fauda", originalLanguage: "he", now: 1000 });
    expect(await repo.findById(created.id)).toEqual(created);
  });
});

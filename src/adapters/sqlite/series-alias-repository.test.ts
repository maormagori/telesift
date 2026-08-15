import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type BetterSqlite3 from "better-sqlite3";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SeriesAliasRepository } from "../../modules/catalog/ports/series-alias-repository.js";
import { createKyselyDb, openDatabase } from "./connection.js";
import { applyMigrations, MIGRATIONS_DIR } from "./migrate.js";
import type { DB } from "./schema.js";
import { createSqliteSeriesAliasRepository } from "./series-alias-repository.js";

function seedSeries(db: BetterSqlite3.Database, canonicalTitle: string): number {
  const row = db
    .prepare("INSERT INTO series (canonical_title, created_at, updated_at) VALUES (?, 1, 1) RETURNING id")
    .get(canonicalTitle) as { id: number };
  return row.id;
}

describe("sqlite series alias repository", () => {
  let dir: string;
  let db: BetterSqlite3.Database;
  let kysely: Kysely<DB>;
  let repo: SeriesAliasRepository;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "telesift-series-aliases-"));
    db = openDatabase(path.join(dir, "telesift.sqlite3"));
    kysely = createKyselyDb(db);
    await applyMigrations(kysely, MIGRATIONS_DIR);
    repo = createSqliteSeriesAliasRepository(kysely);
  });

  afterEach(async () => {
    await kysely.destroy();
    await rm(dir, { recursive: true, force: true });
  });

  it("create inserts a new alias", async () => {
    const seriesId = seedSeries(db, "Fauda");
    const alias = await repo.create({
      seriesId,
      aliasNormalized: "fauda",
      aliasOriginal: "Fauda",
      language: "en",
      source: "extraction",
      now: 1000,
    });
    expect(alias).toMatchObject({ seriesId, aliasNormalized: "fauda", source: "extraction" });
  });

  it("create is idempotent for the same (seriesId, aliasNormalized)", async () => {
    const seriesId = seedSeries(db, "Fauda");
    const first = await repo.create({
      seriesId,
      aliasNormalized: "fauda",
      aliasOriginal: "Fauda",
      language: null,
      source: "manual",
      now: 1000,
    });
    const second = await repo.create({
      seriesId,
      aliasNormalized: "fauda",
      aliasOriginal: "FAUDA",
      language: null,
      source: "extraction",
      now: 2000,
    });
    expect(second.id).toBe(first.id);
    expect(second.source).toBe("manual");
  });

  it("listAll returns aliases across all series", async () => {
    const series1 = seedSeries(db, "Fauda");
    const series2 = seedSeries(db, "The Wire");
    await repo.create({ seriesId: series1, aliasNormalized: "fauda", aliasOriginal: "Fauda", language: null, source: "manual", now: 1000 });
    await repo.create({ seriesId: series2, aliasNormalized: "the wire", aliasOriginal: "The Wire", language: null, source: "manual", now: 1000 });

    const all = await repo.listAll();
    expect(all.map((a) => a.aliasNormalized).sort()).toEqual(["fauda", "the wire"]);
  });

  it("listBySeriesId scopes to a single series", async () => {
    const series1 = seedSeries(db, "Fauda");
    const series2 = seedSeries(db, "The Wire");
    await repo.create({ seriesId: series1, aliasNormalized: "fauda", aliasOriginal: "Fauda", language: null, source: "manual", now: 1000 });
    await repo.create({ seriesId: series2, aliasNormalized: "the wire", aliasOriginal: "The Wire", language: null, source: "manual", now: 1000 });

    const forSeries1 = await repo.listBySeriesId(series1);
    expect(forSeries1.map((a) => a.aliasNormalized)).toEqual(["fauda"]);
  });
});

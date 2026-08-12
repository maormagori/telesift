import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type BetterSqlite3 from "better-sqlite3";
import type { Kysely } from "kysely";
import { sql } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createKyselyDb, openDatabase } from "./connection.js";
import { applyMigrations } from "./migrate.js";
import type { DB } from "./schema.js";

describe("migrate", () => {
  let dir: string;
  let dbPath: string;
  let migrationsDir: string;
  let db: BetterSqlite3.Database;
  let kysely: Kysely<DB>;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "telesift-migrate-"));
    dbPath = path.join(dir, "telesift.sqlite3");
    migrationsDir = path.join(dir, "migrations");
    await mkdir(migrationsDir);
    // No `import ... from "kysely"` here: these files are dynamically imported from a
    // tmpdir with no `node_modules` in its ancestry, so bare-specifier resolution would fail.
    // Real migrations under src/adapters/sqlite/migrations don't have this problem.
    await writeFile(
      path.join(migrationsDir, "0001_create_widgets.ts"),
      `export async function up(db) {
  await db.schema.createTable("widgets").addColumn("id", "integer", (col) => col.primaryKey()).execute();
}
export async function down(db) {
  await db.schema.dropTable("widgets").execute();
}
`,
    );
    await writeFile(
      path.join(migrationsDir, "0002_add_widget_name.ts"),
      `export async function up(db) {
  await db.schema.alterTable("widgets").addColumn("name", "text").execute();
}
export async function down(db) {
  await db.schema.alterTable("widgets").dropColumn("name").execute();
}
`,
    );

    db = openDatabase(dbPath);
    kysely = createKyselyDb(db);
  });

  afterEach(async () => {
    await kysely.destroy();
    await rm(dir, { recursive: true, force: true });
  });

  it("sets the pragmas multi-process SQLite access needs", () => {
    expect(db.prepare("PRAGMA journal_mode").get()).toMatchObject({ journal_mode: "wal" });
    expect(db.prepare("PRAGMA foreign_keys").get()).toMatchObject({ foreign_keys: 1 });
  });

  it("applies pending migrations in filename order", async () => {
    const applied = await applyMigrations(kysely, migrationsDir);

    expect(applied).toEqual(["0001_create_widgets", "0002_add_widget_name"]);
    await sql`INSERT INTO widgets (name) VALUES ('gizmo')`.execute(kysely);
    expect(db.prepare("SELECT name FROM widgets").get()).toEqual({ name: "gizmo" });
  });

  it("is idempotent: re-running applies nothing new", async () => {
    await applyMigrations(kysely, migrationsDir);
    const secondRun = await applyMigrations(kysely, migrationsDir);

    expect(secondRun).toEqual([]);
  });
});

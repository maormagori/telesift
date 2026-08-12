import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase } from "./connection.js";
import { applyMigrations } from "./migrate.js";

describe("migrate", () => {
  let dir: string;
  let dbPath: string;
  let migrationsDir: string;
  let db: DatabaseSync;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "telesift-migrate-"));
    dbPath = path.join(dir, "telesift.sqlite3");
    migrationsDir = path.join(dir, "migrations");
    await mkdir(migrationsDir);
    await writeFile(
      path.join(migrationsDir, "0001_create_widgets.sql"),
      "CREATE TABLE widgets (id INTEGER PRIMARY KEY);",
    );
    await writeFile(
      path.join(migrationsDir, "0002_add_widget_name.sql"),
      "ALTER TABLE widgets ADD COLUMN name TEXT;",
    );

    db = openDatabase(dbPath);
  });

  afterEach(async () => {
    db.close();
    await rm(dir, { recursive: true, force: true });
  });

  it("sets the pragmas multi-process SQLite access needs", () => {
    expect(db.prepare("PRAGMA journal_mode").get()).toMatchObject({ journal_mode: "wal" });
    expect(db.prepare("PRAGMA foreign_keys").get()).toMatchObject({ foreign_keys: 1 });
  });

  it("applies pending migrations in filename order", () => {
    const applied = applyMigrations(db, migrationsDir);

    expect(applied).toEqual(["0001_create_widgets.sql", "0002_add_widget_name.sql"]);
    expect(db.prepare("SELECT filename FROM schema_migrations ORDER BY filename").all()).toEqual([
      { filename: "0001_create_widgets.sql" },
      { filename: "0002_add_widget_name.sql" },
    ]);
    db.exec("INSERT INTO widgets (name) VALUES ('gizmo')");
    expect(db.prepare("SELECT name FROM widgets").get()).toEqual({ name: "gizmo" });
  });

  it("is idempotent: re-running applies nothing new", () => {
    applyMigrations(db, migrationsDir);
    const secondRun = applyMigrations(db, migrationsDir);

    expect(secondRun).toEqual([]);
    expect(db.prepare("SELECT COUNT(*) AS count FROM schema_migrations").get()).toEqual({ count: 2 });
  });
});

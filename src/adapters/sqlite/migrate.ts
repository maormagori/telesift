import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Kysely } from "kysely";
import { FileMigrationProvider, Migrator, type MigrationResult } from "kysely/migration";
import type { DB } from "./schema.js";

export const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "migrations");

export async function applyMigrations(db: Kysely<DB>, migrationsDir: string): Promise<string[]> {
  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({ fs, path, migrationFolder: migrationsDir }),
  });

  const { error, results } = await migrator.migrateToLatest();
  if (error) throw error;

  return (results ?? [])
    .filter((result: MigrationResult) => result.status === "Success")
    .map((result: MigrationResult) => result.migrationName);
}

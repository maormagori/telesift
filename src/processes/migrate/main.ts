import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { openDatabase } from "../../adapters/sqlite/connection.js";
import { applyMigrations } from "../../adapters/sqlite/migrate.js";
import { createLogger } from "../../platform/logging/logger.js";

const rawSchema = z.object({
  DATABASE_PATH: z.string().default("./data/telesift.sqlite3"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../migrations");

function main(): void {
  const config = rawSchema.parse(process.env);
  const logger = createLogger(config.LOG_LEVEL);

  const db = openDatabase(config.DATABASE_PATH);
  try {
    const applied = applyMigrations(db, MIGRATIONS_DIR);
    if (applied.length === 0) {
      logger.info("migrate: no pending migrations", { databasePath: config.DATABASE_PATH });
    } else {
      logger.info("migrate: applied migrations", { databasePath: config.DATABASE_PATH, applied });
    }
  } finally {
    db.close();
  }
}

main();

import "dotenv/config";
import { z } from "zod";
import { createKyselyDb, openDatabase } from "../../adapters/sqlite/connection.js";
import { applyMigrations, MIGRATIONS_DIR } from "../../adapters/sqlite/migrate.js";
import { createLogger } from "../../platform/logging/logger.js";

const rawSchema = z.object({
  DATABASE_PATH: z.string().default("./data/telesift.sqlite3"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

async function main(): Promise<void> {
  const config = rawSchema.parse(process.env);
  const logger = createLogger(config.LOG_LEVEL);

  const db = openDatabase(config.DATABASE_PATH);
  const kysely = createKyselyDb(db);
  try {
    const applied = await applyMigrations(kysely, MIGRATIONS_DIR);
    if (applied.length === 0) {
      logger.info("migrate: no pending migrations", { databasePath: config.DATABASE_PATH });
    } else {
      logger.info("migrate: applied migrations", { databasePath: config.DATABASE_PATH, applied });
    }
  } finally {
    await kysely.destroy();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

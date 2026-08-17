import "dotenv/config";
import { z } from "zod";
import { DatabasePathField, LogLevelField, TelegramServiceUrlField } from "./shared-fields.js";

const rawSchema = z.object({
  DATABASE_PATH: DatabasePathField,
  TELEGRAM_SERVICE_URL: TelegramServiceUrlField,
  INGESTION_WORKER_LOCK_PATH: z.string().default("./data/ingestion-worker.lock"),
  INGESTION_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(30_000),
  INGESTION_PAGE_SIZE: z.coerce.number().int().positive().max(200).default(100),
  INGESTION_BACKFILL_MAX_MESSAGES: z.coerce.number().int().positive().optional(),
  INGESTION_RESCAN_WINDOW_SIZE: z.coerce.number().int().positive().default(100),
  INGESTION_RESCAN_INTERVAL_MS: z.coerce.number().int().positive().default(21_600_000),
  LOG_LEVEL: LogLevelField,
});

export interface IngestionWorkerConfig {
  databasePath: string;
  telegramServiceUrl: string;
  lockPath: string;
  pollIntervalMs: number;
  pageSize: number;
  backfillMaxMessages: number | null;
  rescanWindowSize: number;
  rescanIntervalMs: number;
  logLevel: "debug" | "info" | "warn" | "error";
}

export function loadIngestionWorkerConfig(env: NodeJS.ProcessEnv = process.env): IngestionWorkerConfig {
  const parsed = rawSchema.parse(env);

  return {
    databasePath: parsed.DATABASE_PATH,
    telegramServiceUrl: parsed.TELEGRAM_SERVICE_URL,
    lockPath: parsed.INGESTION_WORKER_LOCK_PATH,
    pollIntervalMs: parsed.INGESTION_POLL_INTERVAL_MS,
    pageSize: parsed.INGESTION_PAGE_SIZE,
    backfillMaxMessages: parsed.INGESTION_BACKFILL_MAX_MESSAGES ?? null,
    rescanWindowSize: parsed.INGESTION_RESCAN_WINDOW_SIZE,
    rescanIntervalMs: parsed.INGESTION_RESCAN_INTERVAL_MS,
    logLevel: parsed.LOG_LEVEL,
  };
}

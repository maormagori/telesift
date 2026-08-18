import "dotenv/config";
import { z } from "zod";
import { DatabasePathField, DownloadStagingDirectoryField, LogLevelField, TelegramServiceUrlField } from "./shared-fields.js";

const rawSchema = z.object({
  DATABASE_PATH: DatabasePathField,
  TELEGRAM_SERVICE_URL: TelegramServiceUrlField,
  DOWNLOAD_WORKER_LOCK_PATH: z.string().default("./data/download-worker.lock"),
  DOWNLOAD_STAGING_DIRECTORY: DownloadStagingDirectoryField,
  DOWNLOAD_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(5_000),
  DOWNLOAD_LEASE_DURATION_MS: z.coerce.number().int().positive().default(60_000),
  DOWNLOAD_PROGRESS_REPORT_INTERVAL_MS: z.coerce.number().int().positive().default(5_000),
  DOWNLOAD_TELEGRAM_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  LOG_LEVEL: LogLevelField,
});

export interface DownloadWorkerConfig {
  databasePath: string;
  telegramServiceUrl: string;
  lockPath: string;
  stagingDirectory: string;
  pollIntervalMs: number;
  leaseDurationMs: number;
  progressReportIntervalMs: number;
  telegramRequestTimeoutMs: number;
  logLevel: "debug" | "info" | "warn" | "error";
}

export function loadDownloadWorkerConfig(env: NodeJS.ProcessEnv = process.env): DownloadWorkerConfig {
  const parsed = rawSchema.parse(env);

  return {
    databasePath: parsed.DATABASE_PATH,
    telegramServiceUrl: parsed.TELEGRAM_SERVICE_URL,
    lockPath: parsed.DOWNLOAD_WORKER_LOCK_PATH,
    stagingDirectory: parsed.DOWNLOAD_STAGING_DIRECTORY,
    pollIntervalMs: parsed.DOWNLOAD_POLL_INTERVAL_MS,
    leaseDurationMs: parsed.DOWNLOAD_LEASE_DURATION_MS,
    progressReportIntervalMs: parsed.DOWNLOAD_PROGRESS_REPORT_INTERVAL_MS,
    telegramRequestTimeoutMs: parsed.DOWNLOAD_TELEGRAM_REQUEST_TIMEOUT_MS,
    logLevel: parsed.LOG_LEVEL,
  };
}

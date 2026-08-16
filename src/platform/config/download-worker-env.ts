import "dotenv/config";
import { z } from "zod";

const rawSchema = z.object({
  DATABASE_PATH: z.string().default("./data/telesift.sqlite3"),
  TELEGRAM_SERVICE_URL: z.string().default("http://127.0.0.1:4001"),
  DOWNLOAD_WORKER_LOCK_PATH: z.string().default("./data/download-worker.lock"),
  DOWNLOAD_STAGING_DIRECTORY: z.string().default("./data/staging"),
  DOWNLOAD_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(5_000),
  DOWNLOAD_LEASE_DURATION_MS: z.coerce.number().int().positive().default(60_000),
  DOWNLOAD_PROGRESS_REPORT_INTERVAL_MS: z.coerce.number().int().positive().default(5_000),
  DOWNLOAD_TELEGRAM_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
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

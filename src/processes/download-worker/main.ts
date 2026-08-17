import "dotenv/config";
import { randomUUID } from "node:crypto";
import { createFsStagingAdapter } from "../../adapters/local-filesystem/fs-staging-adapter.js";
import { createKyselyDb, openDatabase } from "../../adapters/sqlite/connection.js";
import { createSqliteDownloadRepository } from "../../adapters/sqlite/download-repository.js";
import { createSqliteMediaAssetRepository } from "../../adapters/sqlite/media-asset-repository.js";
import { createSqliteMessageRepository } from "../../adapters/sqlite/message-repository.js";
import { createSqliteReleaseRepository } from "../../adapters/sqlite/release-repository.js";
import { createHttpTelegramAccessAdapter } from "../../adapters/telegram-rpc-client/http-telegram-access-adapter.js";
import { createProcessDownloadClaim } from "../../modules/downloads/application/process-download-claim.js";
import { loadDownloadWorkerConfig } from "../../platform/config/download-worker-env.js";
import { createLogger } from "../../platform/logging/logger.js";
import { acquireHeartbeatLockOrExit } from "../../platform/singleton-lock/heartbeat-lock.js";
import { createCancellableWait } from "../../platform/time/cancellable-sleep.js";

async function main(): Promise<void> {
  const config = loadDownloadWorkerConfig();
  const logger = createLogger(config.logLevel);

  const lock = await acquireHeartbeatLockOrExit(config.lockPath, logger, "download-worker");

  const kysely = createKyselyDb(openDatabase(config.databasePath));

  const releaseRepo = createSqliteReleaseRepository(kysely);
  const mediaAssetRepo = createSqliteMediaAssetRepository(kysely);
  const messageRepo = createSqliteMessageRepository(kysely);
  const downloadRepo = createSqliteDownloadRepository(kysely);

  const telegramAccess = createHttpTelegramAccessAdapter(config.telegramServiceUrl, {
    requestTimeoutMs: config.telegramRequestTimeoutMs,
  });
  const staging = createFsStagingAdapter(config.stagingDirectory);

  const processDownloadClaim = createProcessDownloadClaim({
    releaseRepo,
    mediaAssetRepo,
    messageRepo,
    telegramAccess,
    staging,
    downloadRepo,
    progressReportIntervalMs: config.progressReportIntervalMs,
    leaseDurationMs: config.leaseDurationMs,
  });

  const workerId = randomUUID();
  let shuttingDown = false;
  const cancellableWait = createCancellableWait();

  async function runPass(): Promise<boolean> {
    const download = await downloadRepo.claim({ workerId, now: Date.now(), leaseDurationMs: config.leaseDurationMs });
    if (!download) return false;

    try {
      await processDownloadClaim(download, workerId, Date.now());
      logger.info("download-worker processed claim", { downloadId: download.id, releaseId: download.releaseId });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("download-worker claim failed", { downloadId: download.id, releaseId: download.releaseId, error: message });
      await downloadRepo.fail(download.id, workerId, message, Date.now());
    }
    return true;
  }

  logger.info("download-worker started", { stagingDirectory: config.stagingDirectory });

  async function runLoop(): Promise<void> {
    while (!shuttingDown) {
      const processed = await runPass();
      if (shuttingDown) break;
      if (!processed) await cancellableWait.wait(config.pollIntervalMs);
    }
  }

  const loop = runLoop();

  async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info("download-worker shutting down", { signal });
    cancellableWait.cancel();
    await loop;
    await lock.release();
    await kysely.destroy();
    process.exit(0);
  }

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});

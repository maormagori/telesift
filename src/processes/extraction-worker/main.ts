import "dotenv/config";
import { randomUUID } from "node:crypto";
import { createFakeLlmExtractor } from "../../adapters/llm-fake/fake-llm-extractor.js";
import { createOpenAiCompatibleLlmExtractor } from "../../adapters/llm-openai-compatible/openai-compatible-llm-extractor.js";
import { createSqliteContextGroupRepository } from "../../adapters/sqlite/context-group-repository.js";
import { createKyselyDb, openDatabase } from "../../adapters/sqlite/connection.js";
import { createSqliteExtractionRunRepository } from "../../adapters/sqlite/extraction-run-repository.js";
import { createSqliteMediaAssetRepository } from "../../adapters/sqlite/media-asset-repository.js";
import { createSqliteMediaProcessingJobRepository } from "../../adapters/sqlite/media-processing-job-repository.js";
import { createSqliteMessageRepository } from "../../adapters/sqlite/message-repository.js";
import { createSqliteReleaseRepository } from "../../adapters/sqlite/release-repository.js";
import { createSqliteReleaseRevisionRepository } from "../../adapters/sqlite/release-revision-repository.js";
import { createSqliteSeriesAliasRepository } from "../../adapters/sqlite/series-alias-repository.js";
import { createSqliteSeriesRepository } from "../../adapters/sqlite/series-repository.js";
import { createSqliteTelegramChatRepository } from "../../adapters/sqlite/telegram-chat-repository.js";
import { createMaterializeRelease } from "../../modules/catalog/application/materialize-release.js";
import { createBuildOrRefreshContextGroup } from "../../modules/context/application/build-or-refresh-context-group.js";
import { createProcessMediaProcessingJob } from "../../modules/extraction/application/process-media-processing-job.js";
import { loadExtractionWorkerConfig } from "../../platform/config/extraction-worker-env.js";
import { createLogger } from "../../platform/logging/logger.js";
import { acquireHeartbeatLock, LockHeldError, type HeartbeatLock } from "../../platform/singleton-lock/heartbeat-lock.js";
import { createCancellableWait } from "../../platform/time/cancellable-sleep.js";

async function main(): Promise<void> {
  const config = loadExtractionWorkerConfig();
  const logger = createLogger(config.logLevel);

  let lock: HeartbeatLock;
  try {
    lock = await acquireHeartbeatLock(config.lockPath);
  } catch (error) {
    if (error instanceof LockHeldError) {
      logger.error("extraction-worker failed to start: lock already held", { message: error.message });
      process.exit(1);
    }
    throw error;
  }

  const kysely = createKyselyDb(openDatabase(config.databasePath));

  const messageRepo = createSqliteMessageRepository(kysely);
  const mediaAssetRepo = createSqliteMediaAssetRepository(kysely);
  const telegramChatRepo = createSqliteTelegramChatRepository(kysely);
  const contextGroupRepo = createSqliteContextGroupRepository(kysely);
  const extractionRunRepo = createSqliteExtractionRunRepository(kysely);
  const seriesRepo = createSqliteSeriesRepository(kysely);
  const seriesAliasRepo = createSqliteSeriesAliasRepository(kysely);
  const releaseRepo = createSqliteReleaseRepository(kysely);
  const releaseRevisionRepo = createSqliteReleaseRevisionRepository(kysely);
  const jobRepo = createSqliteMediaProcessingJobRepository(kysely);

  const llmExtractor =
    config.llmAdapter === "openai-compatible"
      ? createOpenAiCompatibleLlmExtractor({
          endpointUrl: config.llmEndpointUrl!,
          model: config.llmModel!,
          apiKey: config.llmApiKey,
          requestTimeoutMs: config.llmRequestTimeoutMs,
        })
      : createFakeLlmExtractor();
  const modelVersion = config.llmAdapter === "openai-compatible" ? config.llmModel! : "fake";

  const buildOrRefreshContextGroup = createBuildOrRefreshContextGroup({
    mediaAssetRepo,
    messageRepo,
    contextGroupRepo,
    precedingWindowSize: config.precedingWindowSize,
    quietPeriodMs: config.quietPeriodMs,
  });

  const materializeRelease = createMaterializeRelease({
    seriesRepo,
    seriesAliasRepo,
    releaseRepo,
    releaseRevisionRepo,
    seriesMatchThreshold: config.seriesMatchThreshold,
    autoIndexEnabled: config.autoIndexEnabled,
  });

  const processMediaProcessingJob = createProcessMediaProcessingJob({
    mediaAssetRepo,
    messageRepo,
    telegramChatRepo,
    buildOrRefreshContextGroup,
    extractionRunRepo,
    llmExtractor,
    seriesRepo,
    seriesAliasRepo,
    materializeRelease,
    versions: { pipelineVersion: config.pipelineVersion, promptVersion: config.promptVersion, modelVersion },
  });

  const workerId = randomUUID();
  let shuttingDown = false;
  const cancellableWait = createCancellableWait();

  async function runPass(): Promise<boolean> {
    const job = await jobRepo.claim({ workerId, now: Date.now(), leaseDurationMs: config.leaseDurationMs });
    if (!job) return false;

    try {
      const outcome = await processMediaProcessingJob(job.mediaAssetId, Date.now());
      if (outcome.kind === "pending_context") {
        await jobRepo.fail(job.id, workerId, { error: "pending_context", now: Date.now(), retryAt: outcome.retryAt });
      } else {
        await jobRepo.complete(job.id, workerId, Date.now());
        logger.info("extraction-worker processed job", {
          jobId: job.id,
          mediaAssetId: job.mediaAssetId,
          llmCalled: outcome.llmCalled,
          reviewState: outcome.release?.reviewState ?? null,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("extraction-worker job failed", { jobId: job.id, mediaAssetId: job.mediaAssetId, error: message });
      await jobRepo.fail(job.id, workerId, { error: message, now: Date.now(), retryAt: Date.now() + config.pollIntervalMs });
    }
    return true;
  }

  logger.info("extraction-worker started", { llmAdapter: config.llmAdapter, autoIndexEnabled: config.autoIndexEnabled });

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
    logger.info("extraction-worker shutting down", { signal });
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

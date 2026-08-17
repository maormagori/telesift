import "dotenv/config";
import { createSqliteChannelRepository } from "../../adapters/sqlite/channel-repository.js";
import { createSqliteChatSyncStateRepository } from "../../adapters/sqlite/chat-sync-state-repository.js";
import { createKyselyDb, openDatabase } from "../../adapters/sqlite/connection.js";
import { createSqliteMessageRepository } from "../../adapters/sqlite/message-repository.js";
import { createSqliteTelegramChatRepository } from "../../adapters/sqlite/telegram-chat-repository.js";
import { createHttpTelegramAccessAdapter } from "../../adapters/telegram-rpc-client/http-telegram-access-adapter.js";
import { createSyncChannelUseCase } from "../../modules/ingestion/application/sync-channel.js";
import { loadIngestionWorkerConfig } from "../../platform/config/ingestion-worker-env.js";
import { createLogger } from "../../platform/logging/logger.js";
import { acquireHeartbeatLockOrExit } from "../../platform/singleton-lock/heartbeat-lock.js";
import { createCancellableWait } from "../../platform/time/cancellable-sleep.js";

const INTER_CHANNEL_DELAY_MS = 1000;

async function main(): Promise<void> {
  const config = loadIngestionWorkerConfig();
  const logger = createLogger(config.logLevel);

  const lock = await acquireHeartbeatLockOrExit(config.lockPath, logger, "ingestion-worker");

  const kysely = createKyselyDb(openDatabase(config.databasePath));
  const channelRepo = createSqliteChannelRepository(kysely);
  const syncChannelUseCase = createSyncChannelUseCase({
    telegramAccess: createHttpTelegramAccessAdapter(config.telegramServiceUrl),
    telegramChatRepo: createSqliteTelegramChatRepository(kysely),
    chatSyncStateRepo: createSqliteChatSyncStateRepository(kysely),
    messageRepo: createSqliteMessageRepository(kysely),
    logger,
    config: {
      pageSize: config.pageSize,
      backfillMaxMessages: config.backfillMaxMessages,
      rescanWindowSize: config.rescanWindowSize,
      rescanIntervalMs: config.rescanIntervalMs,
    },
  });

  let shuttingDown = false;
  const cancellableWait = createCancellableWait();

  async function runPass(): Promise<void> {
    const channels = (await channelRepo.list()).filter((channel) => channel.enabled);
    for (const channel of channels) {
      if (shuttingDown) return;
      await syncChannelUseCase.syncChannel(channel, Date.now());
      if (shuttingDown) return;
      await cancellableWait.wait(INTER_CHANNEL_DELAY_MS);
    }
  }

  logger.info("ingestion-worker started", {
    telegramServiceUrl: config.telegramServiceUrl,
    pollIntervalMs: config.pollIntervalMs,
  });

  async function runLoop(): Promise<void> {
    while (!shuttingDown) {
      await runPass();
      if (shuttingDown) break;
      await cancellableWait.wait(config.pollIntervalMs);
    }
  }

  const loop = runLoop();

  async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info("ingestion-worker shutting down", { signal });
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

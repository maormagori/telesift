import { createFakeTelegramAccessAdapter } from "../../adapters/telegram-fake/fake-telegram-access-adapter.js";
import { createTeleprotoTelegramAccessAdapter } from "../../adapters/telegram-teleproto/teleproto-telegram-access-adapter.js";
import { createTelegramAccessUseCases } from "../../modules/telegram-access/application/use-cases.js";
import type { TelegramAccessPort } from "../../modules/telegram-access/ports/telegram-access-port.js";
import { loadConfig, type TelegramServiceConfig } from "../../platform/config/env.js";
import { createLogger, type Logger } from "../../platform/logging/logger.js";
import { installShutdownHandler } from "../../platform/process-lifecycle/graceful-shutdown.js";
import { acquireHeartbeatLockOrExit } from "../../platform/singleton-lock/heartbeat-lock.js";
import { createTelegramInternalServer } from "../../protocols/telegram-internal/server.js";

function createAdapter(config: TelegramServiceConfig, logger: Logger): TelegramAccessPort {
  if (config.telegramAdapter === "fake") {
    logger.warn("TELEGRAM_ADAPTER=fake: no real Telegram connection will be made. Do not use this in production.");
    return createFakeTelegramAccessAdapter();
  }
  return createTeleprotoTelegramAccessAdapter(config.telegramCredentials);
}

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);

  const lock = await acquireHeartbeatLockOrExit(config.lockPath, logger, "telegram-service");

  const adapter = createAdapter(config, logger);
  const useCases = createTelegramAccessUseCases(adapter);
  const app = createTelegramInternalServer(useCases);

  const server = app.listen(config.port, config.host, () => {
    logger.info("telegram-service listening", {
      host: config.host,
      port: config.port,
      adapter: config.telegramAdapter,
    });
  });

  installShutdownHandler(logger, "telegram-service", async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    await lock.release();
  });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});

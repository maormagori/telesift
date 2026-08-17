import type { Logger } from "../logging/logger.js";

export function installShutdownHandler(
  logger: Logger,
  roleName: string,
  cleanup: (signal: string) => Promise<void>,
): void {
  let shuttingDown = false;

  async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`${roleName} shutting down`, { signal });
    await cleanup(signal);
    process.exit(0);
  }

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

import type { TelegramAccessPort } from "../../modules/telegram-access/ports/telegram-access-port.js";
import type { Logger } from "../logging/logger.js";
import type { Clock } from "../time/clock.js";
import { systemClock } from "../time/clock.js";

const CONNECTION_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 1_000;

export interface WaitForTelegramConnectionOptions {
  clock?: Clock;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
  pollIntervalMs?: number;
}

export async function waitForTelegramConnection(
  telegramAccess: Pick<TelegramAccessPort, "getStatus">,
  options: WaitForTelegramConnectionOptions = {},
): Promise<boolean> {
  const clock = options.clock ?? systemClock;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const timeoutMs = options.timeoutMs ?? CONNECTION_TIMEOUT_MS;
  const pollIntervalMs = options.pollIntervalMs ?? POLL_INTERVAL_MS;
  const deadline = clock.now() + timeoutMs;

  for (;;) {
    if (await isConnected(telegramAccess)) return true;
    if (clock.now() >= deadline) return false;
    await sleep(pollIntervalMs);
  }
}

// A worker's own poll loop already tolerates telegram-service being briefly
// unreachable; this only guards the startup race so the first pass doesn't
// throw against a telegram-service container that isn't ready yet.
export async function waitForTelegramConnectionOrExit(
  telegramAccess: Pick<TelegramAccessPort, "getStatus">,
  logger: Logger,
  roleName: string,
): Promise<void> {
  const connected = await waitForTelegramConnection(telegramAccess);
  if (!connected) {
    logger.error(`${roleName} failed to start: telegram-service not connected after ${CONNECTION_TIMEOUT_MS}ms`);
    process.exit(1);
  }
}

async function isConnected(telegramAccess: Pick<TelegramAccessPort, "getStatus">): Promise<boolean> {
  try {
    return (await telegramAccess.getStatus()).connected;
  } catch {
    return false;
  }
}

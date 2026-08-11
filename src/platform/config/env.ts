import "dotenv/config";
import { z } from "zod";

const rawSchema = z.object({
  TELEGRAM_API_ID: z.string().optional(),
  TELEGRAM_API_HASH: z.string().optional(),
  TELEGRAM_SESSION: z.string().optional(),
  TELEGRAM_SERVICE_HOST: z.string().default("0.0.0.0"),
  TELEGRAM_SERVICE_PORT: z.coerce.number().int().positive().default(4001),
  TELEGRAM_SERVICE_LOCK_PATH: z.string().default("./data/telegram-service.lock"),
  TELEGRAM_ADAPTER: z.enum(["teleproto", "fake"]).default("teleproto"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export interface TelegramCredentials {
  apiId: number;
  apiHash: string;
  session: string;
}

interface TelegramServiceConfigBase {
  host: string;
  port: number;
  lockPath: string;
  logLevel: "debug" | "info" | "warn" | "error";
}

export type TelegramServiceConfig =
  | (TelegramServiceConfigBase & { telegramAdapter: "fake"; telegramCredentials: null })
  | (TelegramServiceConfigBase & { telegramAdapter: "teleproto"; telegramCredentials: TelegramCredentials });

export function loadConfig(env: NodeJS.ProcessEnv = process.env): TelegramServiceConfig {
  const parsed = rawSchema.parse(env);

  const base = {
    host: parsed.TELEGRAM_SERVICE_HOST,
    port: parsed.TELEGRAM_SERVICE_PORT,
    lockPath: parsed.TELEGRAM_SERVICE_LOCK_PATH,
    logLevel: parsed.LOG_LEVEL,
  };

  if (parsed.TELEGRAM_ADAPTER === "fake") {
    return { ...base, telegramAdapter: "fake", telegramCredentials: null };
  }

  if (!parsed.TELEGRAM_API_ID || !parsed.TELEGRAM_API_HASH || !parsed.TELEGRAM_SESSION) {
    throw new Error(
      "TELEGRAM_API_ID, TELEGRAM_API_HASH, and TELEGRAM_SESSION are required when TELEGRAM_ADAPTER=teleproto",
    );
  }

  const apiId = Number(parsed.TELEGRAM_API_ID);
  if (!Number.isInteger(apiId)) {
    throw new Error("TELEGRAM_API_ID must be an integer");
  }

  return {
    ...base,
    telegramAdapter: "teleproto",
    telegramCredentials: { apiId, apiHash: parsed.TELEGRAM_API_HASH, session: parsed.TELEGRAM_SESSION },
  };
}

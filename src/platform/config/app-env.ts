import "dotenv/config";
import { z } from "zod";
import { DatabasePathField, LogLevelField, TelegramServiceUrlField } from "./shared-fields.js";

const rawSchema = z.object({
  APP_HOST: z.string().default("0.0.0.0"),
  APP_PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_PATH: DatabasePathField,
  TELEGRAM_SERVICE_URL: TelegramServiceUrlField,
  APP_ADMIN_USERNAME: z.string().min(1),
  APP_ADMIN_PASSWORD_HASH: z.string().min(1),
  APP_SESSION_SECRET: z.string().min(1),
  // Self-hosted operators typically terminate TLS at a reverse proxy in front of `app`,
  // so the cookie's `secure` flag defaults off and is opt-in per deployment.
  // z.coerce.boolean() is not used here: it calls Boolean(value), so the string "false"
  // would coerce to true.
  APP_COOKIE_SECURE: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  LOG_LEVEL: LogLevelField,
});

export interface AppConfig {
  host: string;
  port: number;
  databasePath: string;
  telegramServiceUrl: string;
  adminUsername: string;
  adminPasswordHash: string;
  sessionSecret: string;
  cookieSecure: boolean;
  logLevel: "debug" | "info" | "warn" | "error";
}

export function loadAppConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = rawSchema.parse(env);

  return {
    host: parsed.APP_HOST,
    port: parsed.APP_PORT,
    databasePath: parsed.DATABASE_PATH,
    telegramServiceUrl: parsed.TELEGRAM_SERVICE_URL,
    adminUsername: parsed.APP_ADMIN_USERNAME,
    adminPasswordHash: parsed.APP_ADMIN_PASSWORD_HASH,
    sessionSecret: parsed.APP_SESSION_SECRET,
    cookieSecure: parsed.APP_COOKIE_SECURE,
    logLevel: parsed.LOG_LEVEL,
  };
}

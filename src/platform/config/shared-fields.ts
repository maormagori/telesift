import { z } from "zod";

export const LogLevelField = z.enum(["debug", "info", "warn", "error"]).default("info");
export const DatabasePathField = z.string().default("./data/telesift.sqlite3");
export const TelegramServiceUrlField = z.string().default("http://127.0.0.1:4001");

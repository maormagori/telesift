import { z } from "zod";

export const LogLevelField = z.enum(["debug", "info", "warn", "error"]).default("info");
export const DatabasePathField = z.string().default("./data/telesift.sqlite3");
export const TelegramServiceUrlField = z.string().default("http://127.0.0.1:4001");
// Shared by download-worker (which writes completed files here) and app (which reports
// it to Sonarr via the qBittorrent-compatible API's save_path/temp_path) — both must
// agree on the same directory.
export const DownloadStagingDirectoryField = z.string().default("./data/staging");

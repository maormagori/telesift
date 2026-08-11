export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVELS: LogLevel[] = ["debug", "info", "warn", "error"];

const REDACTED_KEYS = new Set([
  "session",
  "telegram_session",
  "apihash",
  "telegram_api_hash",
  "apiid",
  "telegram_api_id",
  "password",
  "token",
  "secret",
]);

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, val]) => [
        key,
        REDACTED_KEYS.has(key.toLowerCase()) ? "[redacted]" : redact(val),
      ]),
    );
  }
  return value;
}

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

export function createLogger(minLevel: LogLevel = "info"): Logger {
  const minIndex = LEVELS.indexOf(minLevel);

  function log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    if (LEVELS.indexOf(level) < minIndex) return;
    const entry = { level, message, ...(meta ? { meta: redact(meta) } : {}) };
    const line = JSON.stringify(entry);
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
  }

  return {
    debug: (message, meta) => log("debug", message, meta),
    info: (message, meta) => log("info", message, meta),
    warn: (message, meta) => log("warn", message, meta),
    error: (message, meta) => log("error", message, meta),
  };
}

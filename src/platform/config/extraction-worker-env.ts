import "dotenv/config";
import { z } from "zod";

const rawSchema = z.object({
  DATABASE_PATH: z.string().default("./data/telesift.sqlite3"),
  EXTRACTION_WORKER_LOCK_PATH: z.string().default("./data/extraction-worker.lock"),
  EXTRACTION_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(5_000),
  EXTRACTION_LEASE_DURATION_MS: z.coerce.number().int().positive().default(120_000),
  EXTRACTION_PRECEDING_WINDOW_SIZE: z.coerce.number().int().min(0).default(2),
  EXTRACTION_QUIET_PERIOD_MS: z.coerce.number().int().positive().default(10_000),
  EXTRACTION_SERIES_MATCH_THRESHOLD: z.coerce.number().min(0).max(1).default(0.8),
  AUTO_INDEX_ENABLED: z.coerce.boolean().default(true),
  PIPELINE_VERSION: z.string().default("1"),
  PROMPT_VERSION: z.string().default("1"),
  LLM_ADAPTER: z.enum(["openai-compatible", "fake"]).default("fake"),
  LLM_ENDPOINT_URL: z.string().optional(),
  LLM_MODEL: z.string().optional(),
  LLM_API_KEY: z.string().optional(),
  LLM_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(120_000),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export interface ExtractionWorkerConfig {
  databasePath: string;
  lockPath: string;
  pollIntervalMs: number;
  leaseDurationMs: number;
  precedingWindowSize: number;
  quietPeriodMs: number;
  seriesMatchThreshold: number;
  autoIndexEnabled: boolean;
  pipelineVersion: string;
  promptVersion: string;
  llmAdapter: "openai-compatible" | "fake";
  llmEndpointUrl: string | null;
  llmModel: string | null;
  llmApiKey: string | null;
  llmRequestTimeoutMs: number;
  logLevel: "debug" | "info" | "warn" | "error";
}

export function loadExtractionWorkerConfig(env: NodeJS.ProcessEnv = process.env): ExtractionWorkerConfig {
  const parsed = rawSchema.parse(env);

  if (parsed.LLM_ADAPTER === "openai-compatible" && (!parsed.LLM_ENDPOINT_URL || !parsed.LLM_MODEL)) {
    throw new Error("LLM_ENDPOINT_URL and LLM_MODEL are required when LLM_ADAPTER=openai-compatible");
  }

  return {
    databasePath: parsed.DATABASE_PATH,
    lockPath: parsed.EXTRACTION_WORKER_LOCK_PATH,
    pollIntervalMs: parsed.EXTRACTION_POLL_INTERVAL_MS,
    leaseDurationMs: parsed.EXTRACTION_LEASE_DURATION_MS,
    precedingWindowSize: parsed.EXTRACTION_PRECEDING_WINDOW_SIZE,
    quietPeriodMs: parsed.EXTRACTION_QUIET_PERIOD_MS,
    seriesMatchThreshold: parsed.EXTRACTION_SERIES_MATCH_THRESHOLD,
    autoIndexEnabled: parsed.AUTO_INDEX_ENABLED,
    pipelineVersion: parsed.PIPELINE_VERSION,
    promptVersion: parsed.PROMPT_VERSION,
    llmAdapter: parsed.LLM_ADAPTER,
    llmEndpointUrl: parsed.LLM_ENDPOINT_URL ?? null,
    llmModel: parsed.LLM_MODEL ?? null,
    llmApiKey: parsed.LLM_API_KEY ?? null,
    llmRequestTimeoutMs: parsed.LLM_REQUEST_TIMEOUT_MS,
    logLevel: parsed.LOG_LEVEL,
  };
}

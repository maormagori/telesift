import type { ExtractionRun, ExtractionVersions } from "../domain/extraction-run.js";

export interface FindExtractionRunByKeyInput extends ExtractionVersions {
  contextGroupId: number;
  inputFingerprint: string;
}

export interface InsertExtractionRunInput extends ExtractionVersions {
  contextGroupId: number;
  inputFingerprint: string;
  status: "succeeded" | "failed";
  isTvEpisode: boolean | null;
  resultJson: string | null;
  error: string | null;
  now: number;
}

export interface ExtractionRunRepository {
  /** Extraction runs are immutable; this is the idempotency check the job handler makes before calling the LLM. */
  findByKey(input: FindExtractionRunByKeyInput): Promise<ExtractionRun | null>;
  insert(input: InsertExtractionRunInput): Promise<ExtractionRun>;
}

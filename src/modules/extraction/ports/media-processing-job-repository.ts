import type { MediaProcessingJob } from "../domain/media-processing-job.js";

export interface EnqueueMediaProcessingJobInput {
  mediaAssetId: number;
  inputFingerprint: string;
  availableAt: number;
  now: number;
}

export interface ClaimMediaProcessingJobInput {
  workerId: string;
  now: number;
  leaseDurationMs: number;
}

export interface FailMediaProcessingJobInput {
  error: string;
  now: number;
  /** Epoch milliseconds to make the job eligible for another claim; omit for a terminal failure. */
  retryAt?: number;
}

export interface MediaProcessingJobRepository {
  /** Idempotent: no-op if a job for (mediaAssetId, inputFingerprint) already exists in any status. */
  enqueue(input: EnqueueMediaProcessingJobInput): Promise<MediaProcessingJob>;
  /** Atomically claims the oldest eligible job (pending, or processing with an expired lease). Null if none eligible. */
  claim(input: ClaimMediaProcessingJobInput): Promise<MediaProcessingJob | null>;
  /** Returns false if workerId no longer holds this job's lease (it expired and was reclaimed). */
  complete(jobId: number, workerId: string, now: number): Promise<boolean>;
  /** Returns false if workerId no longer holds this job's lease (it expired and was reclaimed). */
  fail(jobId: number, workerId: string, input: FailMediaProcessingJobInput): Promise<boolean>;
}

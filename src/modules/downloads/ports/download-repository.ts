import type { Download, DownloadDesiredState } from "../domain/download.js";

export interface CreateDownloadInput {
  releaseId: number;
  category: string | null;
  now: number;
}

export interface ClaimDownloadInput {
  workerId: string;
  now: number;
  leaseDurationMs: number;
}

export interface ReportDownloadProgressInput {
  progressBytes: number;
  totalBytes: number | null;
  stagingPath: string;
  now: number;
  leaseDurationMs: number;
}

export interface DownloadRepository {
  /** Idempotent: returns the existing non-terminal download for releaseId if one exists, else creates one. */
  create(input: CreateDownloadInput): Promise<Download>;
  findById(downloadId: number): Promise<Download | null>;
  findActiveByReleaseId(releaseId: number): Promise<Download | null>;
  /** Resolves to the most recently created download for the clientHash. */
  findLatestByClientHash(clientHash: string): Promise<Download | null>;
  listActive(category?: string | null): Promise<Download[]>;
  /** Atomically claims the oldest eligible download (queued/paused with no lease, or verifying/downloading with an expired lease). Null if none eligible. */
  claim(input: ClaimDownloadInput): Promise<Download | null>;
  /**
   * Persists progress, renews the lease, and reads back the current desired
   * state in one round trip. Returns null if workerId no longer holds the
   * lease (it expired and was reclaimed) — the caller must abort the transfer.
   */
  reportProgress(downloadId: number, workerId: string, input: ReportDownloadProgressInput): Promise<DownloadDesiredState | null>;
  /** Returns false if workerId no longer holds this download's lease. */
  pause(downloadId: number, workerId: string, progressBytes: number, now: number): Promise<boolean>;
  /** Returns false if workerId no longer holds this download's lease. */
  cancel(downloadId: number, workerId: string, now: number): Promise<boolean>;
  /** Returns false if workerId no longer holds this download's lease. */
  complete(downloadId: number, workerId: string, stagingPath: string, totalBytes: number, now: number): Promise<boolean>;
  /** Returns false if workerId no longer holds this download's lease. */
  fail(downloadId: number, workerId: string, error: string, now: number): Promise<boolean>;
  /** App-facing: changes desiredState without touching the worker's lease. Null if the download doesn't exist. */
  requestDesiredState(downloadId: number, desiredState: DownloadDesiredState, now: number): Promise<Download | null>;
}

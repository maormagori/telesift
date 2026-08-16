export type DownloadDesiredState = "queued" | "paused" | "canceled";

export type DownloadObservedState =
  | "queued"
  | "verifying"
  | "downloading"
  | "paused"
  | "completed"
  | "failed"
  | "canceled";

export interface Download {
  id: number;
  releaseId: number;
  clientHash: string;
  desiredState: DownloadDesiredState;
  observedState: DownloadObservedState;
  progressBytes: number;
  totalBytes: number | null;
  stagingPath: string | null;
  category: string | null;
  workerId: string | null;
  leaseExpiresAt: number | null;
  attempts: number;
  lastError: string | null;
  lastErrorAt: number | null;
  completedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export type MediaProcessingJobStatus = "pending" | "processing" | "completed" | "failed";

export interface MediaProcessingJob {
  id: number;
  mediaAssetId: number;
  inputFingerprint: string;
  status: MediaProcessingJobStatus;
  availableAt: number;
  workerId: string | null;
  leaseExpiresAt: number | null;
  attempts: number;
  lastError: string | null;
  lastErrorAt: number | null;
  createdAt: number;
  updatedAt: number;
}

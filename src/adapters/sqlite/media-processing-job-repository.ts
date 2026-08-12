import type { DatabaseSync } from "node:sqlite";
import type { MediaProcessingJob, MediaProcessingJobStatus } from "../../modules/extraction/domain/media-processing-job.js";
import type { MediaProcessingJobRepository } from "../../modules/extraction/ports/media-processing-job-repository.js";

interface MediaProcessingJobRow {
  id: number;
  media_asset_id: number;
  input_fingerprint: string;
  status: MediaProcessingJobStatus;
  available_at: number;
  worker_id: string | null;
  lease_expires_at: number | null;
  attempts: number;
  last_error: string | null;
  last_error_at: number | null;
  created_at: number;
  updated_at: number;
}

function toMediaProcessingJob(row: MediaProcessingJobRow): MediaProcessingJob {
  return {
    id: row.id,
    mediaAssetId: row.media_asset_id,
    inputFingerprint: row.input_fingerprint,
    status: row.status,
    availableAt: row.available_at,
    workerId: row.worker_id,
    leaseExpiresAt: row.lease_expires_at,
    attempts: row.attempts,
    lastError: row.last_error,
    lastErrorAt: row.last_error_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createSqliteMediaProcessingJobRepository(db: DatabaseSync): MediaProcessingJobRepository {
  return {
    async enqueue(input) {
      const inserted = db
        .prepare(
          `INSERT INTO media_processing_jobs (media_asset_id, input_fingerprint, available_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT (media_asset_id, input_fingerprint) DO NOTHING
           RETURNING *`,
        )
        .get(input.mediaAssetId, input.inputFingerprint, input.availableAt, input.now, input.now) as unknown as
        | MediaProcessingJobRow
        | undefined;
      if (inserted) return toMediaProcessingJob(inserted);

      const existing = db
        .prepare("SELECT * FROM media_processing_jobs WHERE media_asset_id = ? AND input_fingerprint = ?")
        .get(input.mediaAssetId, input.inputFingerprint) as unknown as MediaProcessingJobRow | undefined;
      if (!existing) throw new Error(`Failed to enqueue media processing job: ${input.mediaAssetId}/${input.inputFingerprint}`);
      return toMediaProcessingJob(existing);
    },

    async claim(input) {
      const row = db
        .prepare(
          `UPDATE media_processing_jobs
           SET status = 'processing', worker_id = ?, lease_expires_at = ?, attempts = attempts + 1, updated_at = ?
           WHERE id = (
             SELECT id FROM media_processing_jobs
             WHERE (status = 'pending' AND available_at <= ?)
                OR (status = 'processing' AND lease_expires_at IS NOT NULL AND lease_expires_at <= ?)
             ORDER BY available_at ASC, id ASC
             LIMIT 1
           )
           RETURNING *`,
        )
        .get(input.workerId, input.now + input.leaseDurationMs, input.now, input.now, input.now) as unknown as
        | MediaProcessingJobRow
        | undefined;
      return row ? toMediaProcessingJob(row) : null;
    },

    async complete(jobId, workerId, now) {
      const result = db
        .prepare(
          "UPDATE media_processing_jobs SET status = 'completed', worker_id = NULL, lease_expires_at = NULL, updated_at = ? WHERE id = ? AND status = 'processing' AND worker_id = ?",
        )
        .run(now, jobId, workerId);
      return result.changes > 0;
    },

    async fail(jobId, workerId, input) {
      const result = input.retryAt
        ? db
            .prepare(
              `UPDATE media_processing_jobs
               SET status = 'pending', worker_id = NULL, lease_expires_at = NULL, available_at = ?, last_error = ?, last_error_at = ?, updated_at = ?
               WHERE id = ? AND status = 'processing' AND worker_id = ?`,
            )
            .run(input.retryAt, input.error, input.now, input.now, jobId, workerId)
        : db
            .prepare(
              `UPDATE media_processing_jobs
               SET status = 'failed', worker_id = NULL, lease_expires_at = NULL, last_error = ?, last_error_at = ?, updated_at = ?
               WHERE id = ? AND status = 'processing' AND worker_id = ?`,
            )
            .run(input.error, input.now, input.now, jobId, workerId);
      return result.changes > 0;
    },
  };
}

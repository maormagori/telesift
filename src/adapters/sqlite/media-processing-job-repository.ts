import { sql, type Kysely, type Selectable } from "kysely";
import type { MediaProcessingJob } from "../../modules/extraction/domain/media-processing-job.js";
import type { MediaProcessingJobRepository } from "../../modules/extraction/ports/media-processing-job-repository.js";
import type { DB, MediaProcessingJobsTable } from "./schema.js";

function toMediaProcessingJob(row: Selectable<MediaProcessingJobsTable>): MediaProcessingJob {
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

export function createSqliteMediaProcessingJobRepository(db: Kysely<DB>): MediaProcessingJobRepository {
  return {
    async enqueue(input) {
      const inserted = await db
        .insertInto("media_processing_jobs")
        .values({
          media_asset_id: input.mediaAssetId,
          input_fingerprint: input.inputFingerprint,
          available_at: input.availableAt,
          created_at: input.now,
          updated_at: input.now,
        })
        .onConflict((oc) => oc.columns(["media_asset_id", "input_fingerprint"]).doNothing())
        .returningAll()
        .executeTakeFirst();
      if (inserted) return toMediaProcessingJob(inserted);

      const existing = await db
        .selectFrom("media_processing_jobs")
        .selectAll()
        .where("media_asset_id", "=", input.mediaAssetId)
        .where("input_fingerprint", "=", input.inputFingerprint)
        .executeTakeFirst();
      if (!existing) throw new Error(`Failed to enqueue media processing job: ${input.mediaAssetId}/${input.inputFingerprint}`);
      return toMediaProcessingJob(existing);
    },

    async claim(input) {
      const result = await sql<Selectable<MediaProcessingJobsTable>>`
        UPDATE media_processing_jobs
        SET status = 'processing', worker_id = ${input.workerId}, lease_expires_at = ${input.now + input.leaseDurationMs}, attempts = attempts + 1, updated_at = ${input.now}
        WHERE id = (
          SELECT id FROM media_processing_jobs
          WHERE (status = 'pending' AND available_at <= ${input.now})
             OR (status = 'processing' AND lease_expires_at IS NOT NULL AND lease_expires_at <= ${input.now})
          ORDER BY available_at ASC, id ASC
          LIMIT 1
        )
        RETURNING *
      `.execute(db);
      const row = result.rows[0];
      return row ? toMediaProcessingJob(row) : null;
    },

    async complete(jobId, workerId, now) {
      const result = await db
        .updateTable("media_processing_jobs")
        .set({ status: "completed", worker_id: null, lease_expires_at: null, updated_at: now })
        .where("id", "=", jobId)
        .where("status", "=", "processing")
        .where("worker_id", "=", workerId)
        .executeTakeFirst();
      return result.numUpdatedRows > 0n;
    },

    async fail(jobId, workerId, input) {
      const result = input.retryAt
        ? await db
            .updateTable("media_processing_jobs")
            .set({
              status: "pending",
              worker_id: null,
              lease_expires_at: null,
              available_at: input.retryAt,
              last_error: input.error,
              last_error_at: input.now,
              updated_at: input.now,
            })
            .where("id", "=", jobId)
            .where("status", "=", "processing")
            .where("worker_id", "=", workerId)
            .executeTakeFirst()
        : await db
            .updateTable("media_processing_jobs")
            .set({
              status: "failed",
              worker_id: null,
              lease_expires_at: null,
              last_error: input.error,
              last_error_at: input.now,
              updated_at: input.now,
            })
            .where("id", "=", jobId)
            .where("status", "=", "processing")
            .where("worker_id", "=", workerId)
            .executeTakeFirst();
      return result.numUpdatedRows > 0n;
    },
  };
}

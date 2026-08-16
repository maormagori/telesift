import { sql, type Kysely, type Selectable } from "kysely";
import { releaseIdToBtih } from "../../modules/catalog/domain/release-magnet.js";
import type { Download } from "../../modules/downloads/domain/download.js";
import type { DownloadRepository } from "../../modules/downloads/ports/download-repository.js";
import type { DB, DownloadsTable } from "./schema.js";

const TERMINAL_STATES = ["completed", "failed", "canceled"] as const;

function toDownload(row: Selectable<DownloadsTable>): Download {
  return {
    id: row.id,
    releaseId: row.release_id,
    clientHash: row.client_hash,
    desiredState: row.desired_state,
    observedState: row.observed_state,
    progressBytes: row.progress_bytes,
    totalBytes: row.total_bytes,
    stagingPath: row.staging_path,
    category: row.category,
    workerId: row.worker_id,
    leaseExpiresAt: row.lease_expires_at,
    attempts: row.attempts,
    lastError: row.last_error,
    lastErrorAt: row.last_error_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createSqliteDownloadRepository(db: Kysely<DB>): DownloadRepository {
  return {
    async create(input) {
      const existing = await db
        .selectFrom("downloads")
        .selectAll()
        .where("release_id", "=", input.releaseId)
        .where("observed_state", "not in", TERMINAL_STATES)
        .orderBy("id", "desc")
        .executeTakeFirst();
      if (existing) return toDownload(existing);

      const inserted = await db
        .insertInto("downloads")
        .values({
          release_id: input.releaseId,
          client_hash: releaseIdToBtih(input.releaseId),
          category: input.category,
          created_at: input.now,
          updated_at: input.now,
        })
        .returningAll()
        .executeTakeFirst();
      if (!inserted) throw new Error(`Failed to create download for release: ${input.releaseId}`);
      return toDownload(inserted);
    },

    async findById(downloadId) {
      const row = await db.selectFrom("downloads").selectAll().where("id", "=", downloadId).executeTakeFirst();
      return row ? toDownload(row) : null;
    },

    async findActiveByReleaseId(releaseId) {
      const row = await db
        .selectFrom("downloads")
        .selectAll()
        .where("release_id", "=", releaseId)
        .where("observed_state", "not in", TERMINAL_STATES)
        .orderBy("id", "desc")
        .executeTakeFirst();
      return row ? toDownload(row) : null;
    },

    async findLatestByClientHash(clientHash) {
      const row = await db
        .selectFrom("downloads")
        .selectAll()
        .where("client_hash", "=", clientHash)
        .orderBy("id", "desc")
        .executeTakeFirst();
      return row ? toDownload(row) : null;
    },

    async listActive(category) {
      let query = db.selectFrom("downloads").selectAll().where("observed_state", "!=", "canceled");
      if (category) query = query.where("category", "=", category);
      const rows = await query.orderBy("id", "asc").execute();
      return rows.map(toDownload);
    },

    async claim(input) {
      const result = await sql<Selectable<DownloadsTable>>`
        UPDATE downloads
        SET observed_state = 'verifying', worker_id = ${input.workerId}, lease_expires_at = ${input.now + input.leaseDurationMs}, attempts = attempts + 1, updated_at = ${input.now}
        WHERE id = (
          SELECT id FROM downloads
          WHERE observed_state NOT IN ('completed', 'failed', 'canceled')
            AND NOT (desired_state = 'paused' AND observed_state = 'paused')
            AND (
              (observed_state IN ('queued', 'paused') AND lease_expires_at IS NULL)
              OR (observed_state IN ('verifying', 'downloading') AND lease_expires_at IS NOT NULL AND lease_expires_at <= ${input.now})
            )
          ORDER BY created_at ASC, id ASC
          LIMIT 1
        )
        RETURNING *
      `.execute(db);
      const row = result.rows[0];
      return row ? toDownload(row) : null;
    },

    async reportProgress(downloadId, workerId, input) {
      const result = await sql<{ desired_state: Download["desiredState"] }>`
        UPDATE downloads
        SET progress_bytes = ${input.progressBytes}, total_bytes = COALESCE(${input.totalBytes}, total_bytes),
            observed_state = 'downloading', staging_path = ${input.stagingPath},
            lease_expires_at = ${input.now + input.leaseDurationMs}, updated_at = ${input.now}
        WHERE id = ${downloadId} AND worker_id = ${workerId} AND observed_state IN ('verifying', 'downloading')
        RETURNING desired_state
      `.execute(db);
      return result.rows[0]?.desired_state ?? null;
    },

    async pause(downloadId, workerId, progressBytes, now) {
      const result = await db
        .updateTable("downloads")
        .set({ observed_state: "paused", progress_bytes: progressBytes, worker_id: null, lease_expires_at: null, updated_at: now })
        .where("id", "=", downloadId)
        .where("worker_id", "=", workerId)
        .where("observed_state", "not in", TERMINAL_STATES)
        .executeTakeFirst();
      return result.numUpdatedRows > 0n;
    },

    async cancel(downloadId, workerId, now) {
      const result = await db
        .updateTable("downloads")
        .set({ observed_state: "canceled", worker_id: null, lease_expires_at: null, updated_at: now })
        .where("id", "=", downloadId)
        .where("worker_id", "=", workerId)
        .where("observed_state", "not in", TERMINAL_STATES)
        .executeTakeFirst();
      return result.numUpdatedRows > 0n;
    },

    async complete(downloadId, workerId, stagingPath, totalBytes, now) {
      const result = await db
        .updateTable("downloads")
        .set({
          observed_state: "completed",
          staging_path: stagingPath,
          progress_bytes: totalBytes,
          total_bytes: totalBytes,
          worker_id: null,
          lease_expires_at: null,
          completed_at: now,
          updated_at: now,
        })
        .where("id", "=", downloadId)
        .where("worker_id", "=", workerId)
        .where("observed_state", "in", ["verifying", "downloading"])
        .executeTakeFirst();
      return result.numUpdatedRows > 0n;
    },

    async fail(downloadId, workerId, error, now) {
      const result = await db
        .updateTable("downloads")
        .set({ observed_state: "failed", worker_id: null, lease_expires_at: null, last_error: error, last_error_at: now, updated_at: now })
        .where("id", "=", downloadId)
        .where("worker_id", "=", workerId)
        .where("observed_state", "not in", TERMINAL_STATES)
        .executeTakeFirst();
      return result.numUpdatedRows > 0n;
    },

    async requestDesiredState(downloadId, desiredState, now) {
      const row = await db
        .updateTable("downloads")
        .set({ desired_state: desiredState, updated_at: now })
        .where("id", "=", downloadId)
        .returningAll()
        .executeTakeFirst();
      return row ? toDownload(row) : null;
    },
  };
}

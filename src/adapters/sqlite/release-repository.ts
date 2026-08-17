import type { Kysely, Selectable } from "kysely";
import type { Release, ReleaseFields } from "../../modules/catalog/domain/release.js";
import type { ReleaseRepository } from "../../modules/catalog/ports/release-repository.js";
import type { DB, ReleasesTable } from "./schema.js";

function toRelease(row: Selectable<ReleasesTable>): Release {
  return {
    id: row.id,
    mediaAssetId: row.media_asset_id,
    seriesId: row.series_id,
    extractionRunId: row.extraction_run_id,
    season: row.season,
    episode: row.episode,
    resolution: row.resolution,
    source: row.source,
    codec: row.codec,
    language: row.language,
    displayTitle: row.display_title,
    reviewState: row.review_state,
    manuallyVerified: row.manually_verified === 1,
    manuallyVerifiedAt: row.manually_verified_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toRow(fields: ReleaseFields) {
  return {
    series_id: fields.seriesId,
    extraction_run_id: fields.extractionRunId,
    season: fields.season,
    episode: fields.episode,
    resolution: fields.resolution,
    source: fields.source,
    codec: fields.codec,
    language: fields.language,
    display_title: fields.displayTitle,
    review_state: fields.reviewState,
    manually_verified: fields.manuallyVerified ? 1 : 0,
    manually_verified_at: fields.manuallyVerifiedAt,
  };
}

export function createSqliteReleaseRepository(db: Kysely<DB>): ReleaseRepository {
  return {
    async findById(releaseId) {
      const row = await db.selectFrom("releases").selectAll().where("id", "=", releaseId).executeTakeFirst();
      return row ? toRelease(row) : null;
    },

    async findByMediaAssetId(mediaAssetId) {
      const row = await db.selectFrom("releases").selectAll().where("media_asset_id", "=", mediaAssetId).executeTakeFirst();
      return row ? toRelease(row) : null;
    },

    async listByReviewState(reviewState, options) {
      let query = db.selectFrom("releases").selectAll().where("review_state", "=", reviewState);
      if (options.afterId !== null) {
        query = query.where("id", ">", options.afterId);
      }
      const rows = await query.orderBy("id", "asc").limit(options.limit).execute();
      return rows.map(toRelease);
    },

    async create(input) {
      const row = await db
        .insertInto("releases")
        .values({
          media_asset_id: input.mediaAssetId,
          ...toRow(input.fields),
          created_at: input.now,
          updated_at: input.now,
        })
        .returningAll()
        .executeTakeFirst();
      if (!row) throw new Error(`Failed to create release for media asset: ${input.mediaAssetId}`);
      return toRelease(row);
    },

    async update(input) {
      const row = await db
        .updateTable("releases")
        .set({ ...toRow(input.fields), updated_at: input.now })
        .where("id", "=", input.releaseId)
        .returningAll()
        .executeTakeFirst();
      if (!row) throw new Error(`Failed to update release: ${input.releaseId}`);
      return toRelease(row);
    },
  };
}

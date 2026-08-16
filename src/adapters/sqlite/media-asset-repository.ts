import type { Kysely, Selectable } from "kysely";
import type { MediaAsset } from "../../modules/ingestion/domain/media-asset.js";
import type { MediaAssetRepository } from "../../modules/ingestion/ports/media-asset-repository.js";
import type { DB, MediaAssetsTable } from "./schema.js";

function toMediaAsset(row: Selectable<MediaAssetsTable>): MediaAsset {
  return {
    id: row.id,
    messageId: row.message_id,
    fileName: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    durationSeconds: row.duration_seconds,
    width: row.width,
    height: row.height,
    availability: row.availability,
    lastVerifiedAt: row.last_verified_at,
    unavailableAt: row.unavailable_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createSqliteMediaAssetRepository(db: Kysely<DB>): MediaAssetRepository {
  return {
    async findById(mediaAssetId) {
      const row = await db.selectFrom("media_assets").selectAll().where("id", "=", mediaAssetId).executeTakeFirst();
      return row ? toMediaAsset(row) : null;
    },

    async updateAvailability(mediaAssetId, input) {
      await db
        .updateTable("media_assets")
        .set({
          availability: input.availability,
          last_verified_at: input.availability === "available" ? input.now : undefined,
          unavailable_at: input.availability === "unavailable" ? input.now : undefined,
          updated_at: input.now,
        })
        .where("id", "=", mediaAssetId)
        .execute();
    },
  };
}

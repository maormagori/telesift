import type { Kysely, SelectQueryBuilder } from "kysely";
import type { Release } from "../../modules/catalog/domain/release.js";
import type { ReleaseSearchFilter, ReleaseSearchRepository, ReleaseSearchResult } from "../../modules/catalog/ports/release-search-repository.js";
import type { DB } from "./schema.js";

function toRelease(row: {
  id: number;
  media_asset_id: number;
  series_id: number | null;
  extraction_run_id: number;
  season: number | null;
  episode: number | null;
  resolution: string | null;
  source: string | null;
  codec: string | null;
  language: string | null;
  display_title: string;
  review_state: Release["reviewState"];
  manually_verified: number;
  manually_verified_at: number | null;
  created_at: number;
  updated_at: number;
}): Release {
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

function applyFilters<O>(
  query: SelectQueryBuilder<DB, "releases" | "media_assets", O>,
  filter: Pick<ReleaseSearchFilter, "seriesIds" | "season" | "episode">,
): SelectQueryBuilder<DB, "releases" | "media_assets", O> {
  let filtered = query.where("releases.review_state", "=", "approved").where("media_assets.availability", "!=", "unavailable");
  if (filter.seriesIds !== null) filtered = filtered.where("releases.series_id", "in", filter.seriesIds);
  if (filter.season !== null) filtered = filtered.where("releases.season", "=", filter.season);
  if (filter.episode !== null) filtered = filtered.where("releases.episode", "=", filter.episode);
  return filtered;
}

export function createSqliteReleaseSearchRepository(db: Kysely<DB>): ReleaseSearchRepository {
  return {
    async searchApproved(filter) {
      const base = db.selectFrom("releases").innerJoin("media_assets", "media_assets.id", "releases.media_asset_id");

      const rows = await applyFilters(
        base.select([
          "releases.id",
          "releases.media_asset_id",
          "releases.series_id",
          "releases.extraction_run_id",
          "releases.season",
          "releases.episode",
          "releases.resolution",
          "releases.source",
          "releases.codec",
          "releases.language",
          "releases.display_title",
          "releases.review_state",
          "releases.manually_verified",
          "releases.manually_verified_at",
          "releases.created_at",
          "releases.updated_at",
          "media_assets.size_bytes",
          "media_assets.availability",
        ]),
        filter,
      )
        .orderBy("releases.created_at", "desc")
        .orderBy("releases.id", "desc")
        .limit(filter.limit)
        .offset(filter.offset)
        .execute();

      const totalRow = await applyFilters(base.select((eb) => eb.fn.countAll<number>().as("total")), filter).executeTakeFirst();

      const items: ReleaseSearchResult[] = rows.map((row) => ({
        release: toRelease(row),
        sizeBytes: row.size_bytes,
        availability: row.availability,
      }));

      return { items, total: Number(totalRow?.total ?? 0) };
    },
  };
}

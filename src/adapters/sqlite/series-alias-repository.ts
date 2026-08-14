import type { Kysely, Selectable } from "kysely";
import type { SeriesAlias } from "../../modules/catalog/domain/series-alias.js";
import type { SeriesAliasRepository } from "../../modules/catalog/ports/series-alias-repository.js";
import type { DB, SeriesAliasesTable } from "./schema.js";

function toSeriesAlias(row: Selectable<SeriesAliasesTable>): SeriesAlias {
  return {
    id: row.id,
    seriesId: row.series_id,
    aliasNormalized: row.alias_normalized,
    aliasOriginal: row.alias_original,
    language: row.language,
    source: row.source,
    createdAt: row.created_at,
  };
}

export function createSqliteSeriesAliasRepository(db: Kysely<DB>): SeriesAliasRepository {
  return {
    async listAll() {
      const rows = await db.selectFrom("series_aliases").selectAll().execute();
      return rows.map(toSeriesAlias);
    },

    async listBySeriesId(seriesId) {
      const rows = await db.selectFrom("series_aliases").selectAll().where("series_id", "=", seriesId).execute();
      return rows.map(toSeriesAlias);
    },

    async create(input) {
      const inserted = await db
        .insertInto("series_aliases")
        .values({
          series_id: input.seriesId,
          alias_normalized: input.aliasNormalized,
          alias_original: input.aliasOriginal,
          language: input.language,
          source: input.source,
          created_at: input.now,
        })
        .onConflict((oc) => oc.columns(["series_id", "alias_normalized"]).doNothing())
        .returningAll()
        .executeTakeFirst();
      if (inserted) return toSeriesAlias(inserted);

      const existing = await db
        .selectFrom("series_aliases")
        .selectAll()
        .where("series_id", "=", input.seriesId)
        .where("alias_normalized", "=", input.aliasNormalized)
        .executeTakeFirst();
      if (!existing) throw new Error(`Failed to create series alias: ${input.seriesId}/${input.aliasNormalized}`);
      return toSeriesAlias(existing);
    },
  };
}

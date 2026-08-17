import type { Kysely, Selectable } from "kysely";
import type { Series } from "../../modules/catalog/domain/series.js";
import type { SeriesRepository } from "../../modules/catalog/ports/series-repository.js";
import type { DB, SeriesTable } from "./schema.js";

function toSeries(row: Selectable<SeriesTable>): Series {
  return {
    id: row.id,
    canonicalTitle: row.canonical_title,
    originalLanguage: row.original_language,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createSqliteSeriesRepository(db: Kysely<DB>): SeriesRepository {
  return {
    async findById(seriesId) {
      const row = await db.selectFrom("series").selectAll().where("id", "=", seriesId).executeTakeFirst();
      return row ? toSeries(row) : null;
    },

    async create(input) {
      const row = await db
        .insertInto("series")
        .values({
          canonical_title: input.canonicalTitle,
          original_language: input.originalLanguage,
          created_at: input.now,
          updated_at: input.now,
        })
        .returningAll()
        .executeTakeFirst();
      if (!row) throw new Error(`Failed to create series: ${input.canonicalTitle}`);
      return toSeries(row);
    },

    async search(query, limit) {
      const rows = await db
        .selectFrom("series")
        .selectAll()
        .where("canonical_title", "like", `%${query}%`)
        .orderBy("canonical_title", "asc")
        .limit(limit)
        .execute();
      return rows.map(toSeries);
    },
  };
}

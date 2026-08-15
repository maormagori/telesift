import type { SeriesAlias, SeriesAliasSource } from "../domain/series-alias.js";

export interface CreateSeriesAliasInput {
  seriesId: number;
  aliasNormalized: string;
  aliasOriginal: string;
  language: string | null;
  source: SeriesAliasSource;
  now: number;
}

export interface SeriesAliasRepository {
  /** All aliases across all series, for local candidate matching. */
  listAll(): Promise<SeriesAlias[]>;
  listBySeriesId(seriesId: number): Promise<SeriesAlias[]>;
  /** Idempotent: no-op if (seriesId, aliasNormalized) already exists. */
  create(input: CreateSeriesAliasInput): Promise<SeriesAlias>;
}

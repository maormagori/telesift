import type { Series } from "../domain/series.js";

export interface CreateSeriesInput {
  canonicalTitle: string;
  originalLanguage: string | null;
  now: number;
}

export interface SeriesRepository {
  findById(seriesId: number): Promise<Series | null>;
  create(input: CreateSeriesInput): Promise<Series>;
  /** Case-insensitive substring match on canonicalTitle, for the review edit form's series picker. */
  search(query: string, limit: number): Promise<Series[]>;
}

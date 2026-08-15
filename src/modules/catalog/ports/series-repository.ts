import type { Series } from "../domain/series.js";

export interface CreateSeriesInput {
  canonicalTitle: string;
  originalLanguage: string | null;
  now: number;
}

export interface SeriesRepository {
  findById(seriesId: number): Promise<Series | null>;
  create(input: CreateSeriesInput): Promise<Series>;
}

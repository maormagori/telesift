export type SeriesAliasSource = "manual" | "extraction";

export interface SeriesAlias {
  id: number;
  seriesId: number;
  aliasNormalized: string;
  aliasOriginal: string;
  language: string | null;
  source: SeriesAliasSource;
  createdAt: number;
}

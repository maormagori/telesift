import { matchSeriesAliases } from "../../catalog/domain/series-matching.js";
import type { ReleaseSearchRepository, ReleaseSearchResult } from "../../catalog/ports/release-search-repository.js";
import type { SeriesAliasRepository } from "../../catalog/ports/series-alias-repository.js";

export interface SearchReleasesDeps {
  seriesAliasRepo: SeriesAliasRepository;
  releaseSearchRepo: ReleaseSearchRepository;
  seriesMatchThreshold: number;
}

export interface SearchReleasesQuery {
  /** Blank/null means no title filter — "browse" mode, used by t=search and the UI simulator. */
  queryText: string | null;
  season: number | null;
  episode: number | null;
  offset: number;
  limit: number;
}

export interface SearchReleasesOutput {
  items: ReleaseSearchResult[];
  total: number;
  /** Which local series the query text matched, so callers can tell "no series matched" apart from "series matched, nothing approved/available." */
  matchedSeriesIds: number[];
}

export function createSearchReleasesUseCase(deps: SearchReleasesDeps): (query: SearchReleasesQuery) => Promise<SearchReleasesOutput> {
  return async function searchReleases(query) {
    const queryText = query.queryText?.trim() ?? "";

    let seriesIds: number[] | null = null;
    let matchedSeriesIds: number[] = [];
    if (queryText.length > 0) {
      const aliases = await deps.seriesAliasRepo.listAll();
      const matches = matchSeriesAliases(queryText, aliases, deps.seriesMatchThreshold);
      if (matches.length === 0) return { items: [], total: 0, matchedSeriesIds: [] };
      matchedSeriesIds = matches.map((m) => m.seriesId);
      seriesIds = matchedSeriesIds;
    }

    const result = await deps.releaseSearchRepo.searchApproved({
      seriesIds,
      season: query.season,
      episode: query.episode,
      offset: query.offset,
      limit: query.limit,
    });

    return { items: result.items, total: result.total, matchedSeriesIds };
  };
}

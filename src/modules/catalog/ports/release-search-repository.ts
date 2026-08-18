import type { MediaAvailability } from "../../ingestion/domain/media-asset.js";
import type { Release } from "../domain/release.js";

export interface ReleaseSearchFilter {
  /** null = no series filter ("browse" mode, e.g. a blank search query). */
  seriesIds: number[] | null;
  season: number | null;
  episode: number | null;
  offset: number;
  limit: number;
}

export interface ReleaseSearchResult {
  release: Release;
  sizeBytes: number | null;
  availability: MediaAvailability;
}

export interface ReleaseSearchRepository {
  /**
   * Approved and not-unavailable releases only, newest first. Availability filtering
   * happens inside this same paginated query (not after, in the application layer) so
   * offset/limit and total stay accurate.
   */
  searchApproved(filter: ReleaseSearchFilter): Promise<{ items: ReleaseSearchResult[]; total: number }>;
}

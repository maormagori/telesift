import type { Release, ReleaseFields, ReleaseReviewState } from "../domain/release.js";

export interface CreateReleaseInput {
  mediaAssetId: number;
  fields: ReleaseFields;
  now: number;
}

export interface UpdateReleaseInput {
  releaseId: number;
  fields: ReleaseFields;
  now: number;
}

export interface ListByReviewStateOptions {
  /** Pass the last returned release's id to page further; `null` starts from the oldest release (FIFO triage order). */
  afterId: number | null;
  limit: number;
}

export interface ReleaseRepository {
  findById(releaseId: number): Promise<Release | null>;
  findByMediaAssetId(mediaAssetId: number): Promise<Release | null>;
  /** Ordered oldest-first (ascending id) so the operator triages the queue in FIFO order. */
  listByReviewState(reviewState: ReleaseReviewState, options: ListByReviewStateOptions): Promise<Release[]>;
  create(input: CreateReleaseInput): Promise<Release>;
  update(input: UpdateReleaseInput): Promise<Release>;
}

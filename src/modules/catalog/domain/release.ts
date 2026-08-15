export type ReleaseReviewState = "pending_review" | "approved" | "rejected";

export interface Release {
  id: number;
  mediaAssetId: number;
  seriesId: number | null;
  extractionRunId: number;
  season: number | null;
  episode: number | null;
  resolution: string | null;
  source: string | null;
  codec: string | null;
  language: string | null;
  displayTitle: string;
  reviewState: ReleaseReviewState;
  manuallyVerified: boolean;
  manuallyVerifiedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface ReleaseFields {
  seriesId: number | null;
  extractionRunId: number;
  season: number | null;
  episode: number | null;
  resolution: string | null;
  source: string | null;
  codec: string | null;
  language: string | null;
  displayTitle: string;
  reviewState: ReleaseReviewState;
  manuallyVerified: boolean;
  manuallyVerifiedAt: number | null;
}

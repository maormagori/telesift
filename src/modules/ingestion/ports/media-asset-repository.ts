import type { MediaAsset, MediaAvailability } from "../domain/media-asset.js";

export interface UpdateMediaAssetAvailabilityInput {
  availability: MediaAvailability;
  now: number;
}

export interface MediaAssetRepository {
  findById(mediaAssetId: number): Promise<MediaAsset | null>;
  /** Zero-or-one per message in v1 — see AGENTS.md's ingestion data model. */
  findByMessageId(messageId: number): Promise<MediaAsset | null>;
  /** Sets availability plus lastVerifiedAt (when available) or unavailableAt (when unavailable). */
  updateAvailability(mediaAssetId: number, input: UpdateMediaAssetAvailabilityInput): Promise<void>;
}

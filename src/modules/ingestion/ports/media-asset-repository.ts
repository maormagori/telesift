import type { MediaAsset } from "../domain/media-asset.js";

export interface MediaAssetRepository {
  findById(mediaAssetId: number): Promise<MediaAsset | null>;
  /** Zero-or-one per message in v1 — see AGENTS.md's ingestion data model. */
  findByMessageId(messageId: number): Promise<MediaAsset | null>;
}

import type { MediaAsset } from "../domain/media-asset.js";

export interface MediaAssetRepository {
  findById(mediaAssetId: number): Promise<MediaAsset | null>;
}

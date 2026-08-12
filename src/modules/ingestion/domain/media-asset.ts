export type MediaAvailability = "available" | "unknown" | "unavailable";

export interface MediaAssetInput {
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
}

export interface MediaAsset extends MediaAssetInput {
  id: number;
  messageId: number;
  availability: MediaAvailability;
  lastVerifiedAt: number | null;
  unavailableAt: number | null;
  createdAt: number;
  updatedAt: number;
}

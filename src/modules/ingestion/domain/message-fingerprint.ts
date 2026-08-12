import { createHash } from "node:crypto";
import type { MediaAssetInput } from "./media-asset.js";

export interface MessageFingerprintInput {
  text: string | null;
  replyToMessageId: number | null;
  mediaGroupId: string | null;
  sourceEditedAt: number | null;
  media: MediaAssetInput | null;
}

export function computeMessageFingerprint(input: MessageFingerprintInput): string {
  const stable = {
    text: input.text,
    replyToMessageId: input.replyToMessageId,
    mediaGroupId: input.mediaGroupId,
    sourceEditedAt: input.sourceEditedAt,
    media: input.media && {
      fileName: input.media.fileName,
      mimeType: input.media.mimeType,
      sizeBytes: input.media.sizeBytes,
      durationSeconds: input.media.durationSeconds,
      width: input.media.width,
      height: input.media.height,
    },
  };
  return createHash("sha256").update(JSON.stringify(stable)).digest("hex");
}

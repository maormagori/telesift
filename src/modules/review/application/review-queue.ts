import type { MediaAsset } from "../../ingestion/domain/media-asset.js";
import type { TelegramMessage } from "../../ingestion/domain/telegram-message.js";
import type { MediaAssetRepository } from "../../ingestion/ports/media-asset-repository.js";
import type { MessageRepository } from "../../ingestion/ports/message-repository.js";
import type { Release } from "../../catalog/domain/release.js";
import type { ReleaseRevision } from "../../catalog/domain/release-revision.js";
import type { ReleaseRepository } from "../../catalog/ports/release-repository.js";
import type { ReleaseRevisionRepository } from "../../catalog/ports/release-revision-repository.js";
import type { SeriesRepository } from "../../catalog/ports/series-repository.js";
import { ReleaseNotFoundError } from "./review-use-cases.js";

export interface ReleaseSourceContext {
  message: TelegramMessage | null;
  media: MediaAsset | null;
}

export interface ReleaseDetail {
  release: Release;
  source: ReleaseSourceContext;
  revisions: ReleaseRevision[];
  seriesTitle: string | null;
}

export interface ReviewQueueDeps {
  releaseRepo: ReleaseRepository;
  releaseRevisionRepo: ReleaseRevisionRepository;
  mediaAssetRepo: MediaAssetRepository;
  messageRepo: MessageRepository;
  seriesRepo: SeriesRepository;
}

export interface ReviewQueueUseCases {
  /** pending_review releases, oldest first, for the triage queue. */
  listPendingReview(options: { afterId: number | null; limit: number }): Promise<Release[]>;
  /** Full context for one release — original Telegram source plus edit/review history — fetched on row-expand. */
  getReleaseDetail(releaseId: number): Promise<ReleaseDetail>;
}

export function createReviewQueueUseCases(deps: ReviewQueueDeps): ReviewQueueUseCases {
  return {
    async listPendingReview(options) {
      return deps.releaseRepo.listByReviewState("pending_review", options);
    },

    async getReleaseDetail(releaseId) {
      const release = await deps.releaseRepo.findById(releaseId);
      if (!release) throw new ReleaseNotFoundError(releaseId);

      const media = await deps.mediaAssetRepo.findById(release.mediaAssetId);
      const message = media ? await deps.messageRepo.findById(media.messageId) : null;
      const revisions = await deps.releaseRevisionRepo.listByReleaseId(releaseId);
      const series = release.seriesId !== null ? await deps.seriesRepo.findById(release.seriesId) : null;

      return { release, source: { message, media }, revisions, seriesTitle: series?.canonicalTitle ?? null };
    },
  };
}

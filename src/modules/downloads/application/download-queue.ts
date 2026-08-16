import type { Release } from "../../catalog/domain/release.js";
import type { ReleaseRepository } from "../../catalog/ports/release-repository.js";
import type { Download } from "../domain/download.js";
import type { DownloadRepository } from "../ports/download-repository.js";

export interface DownloadWithRelease {
  download: Download;
  /** Null only if the release was deleted after the download was created — shouldn't happen in practice. */
  release: Release | null;
}

export interface DownloadQueueDeps {
  downloadRepo: DownloadRepository;
  releaseRepo: ReleaseRepository;
}

export interface DownloadQueueUseCases {
  /** Every non-canceled download (queued/verifying/downloading/paused/completed/failed), each paired with its release for a human-readable title. */
  listDownloads(): Promise<DownloadWithRelease[]>;
}

export function createDownloadQueueUseCases(deps: DownloadQueueDeps): DownloadQueueUseCases {
  return {
    async listDownloads() {
      const downloads = await deps.downloadRepo.listActive();
      return Promise.all(
        downloads.map(async (download) => ({ download, release: await deps.releaseRepo.findById(download.releaseId) })),
      );
    },
  };
}

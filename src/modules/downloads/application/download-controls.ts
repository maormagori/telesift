import type { ReleaseRepository } from "../../catalog/ports/release-repository.js";
import type { Download } from "../domain/download.js";
import type { DownloadRepository } from "../ports/download-repository.js";
import { createDownloadForRelease } from "./grab-release.js";

export interface DownloadControlsDeps {
  releaseRepo: ReleaseRepository;
  downloadRepo: DownloadRepository;
}

export interface DownloadControls {
  pauseDownload(downloadId: number, now: number): Promise<Download | null>;
  resumeDownload(downloadId: number, now: number): Promise<Download | null>;
  cancelDownload(downloadId: number, now: number): Promise<Download | null>;
  /** Not a resurrection of the failed row — creates a new download for the same release, sharing its client hash. */
  retryDownload(releaseId: number, category: string | null, now: number): Promise<Download>;
}

export function createDownloadControls(deps: DownloadControlsDeps): DownloadControls {
  const downloadForRelease = createDownloadForRelease(deps);

  return {
    async pauseDownload(downloadId, now) {
      return deps.downloadRepo.requestDesiredState(downloadId, "paused", now);
    },
    async resumeDownload(downloadId, now) {
      return deps.downloadRepo.requestDesiredState(downloadId, "queued", now);
    },
    async cancelDownload(downloadId, now) {
      return deps.downloadRepo.requestDesiredState(downloadId, "canceled", now);
    },
    async retryDownload(releaseId, category, now) {
      return downloadForRelease(releaseId, category, now);
    },
  };
}

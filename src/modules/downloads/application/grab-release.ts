import { extractReleaseIdFromMagnetUri } from "../../catalog/domain/release-magnet.js";
import type { ReleaseRepository } from "../../catalog/ports/release-repository.js";
import type { Download } from "../domain/download.js";
import type { DownloadRepository } from "../ports/download-repository.js";

export class ReleaseNotFoundError extends Error {
  constructor(public readonly releaseId: number) {
    super(`Release not found: ${releaseId}`);
    this.name = "ReleaseNotFoundError";
  }
}

export class InvalidMagnetUriError extends Error {
  constructor(public readonly magnetUri: string) {
    super(`Could not extract a release id from magnet URI: ${magnetUri}`);
    this.name = "InvalidMagnetUriError";
  }
}

export interface GrabReleaseDeps {
  releaseRepo: ReleaseRepository;
  downloadRepo: DownloadRepository;
}

/**
 * Shared by the magnet-decoding grab path and the app-facing retry path
 * (`download-controls.ts`) so both funnel through the same idempotent
 * creation logic instead of duplicating it.
 */
export function createDownloadForRelease(deps: GrabReleaseDeps) {
  return async function downloadForRelease(releaseId: number, category: string | null, now: number): Promise<Download> {
    const release = await deps.releaseRepo.findById(releaseId);
    if (!release) throw new ReleaseNotFoundError(releaseId);
    return deps.downloadRepo.create({ releaseId, category, now });
  };
}

/**
 * A Sonarr grab: decodes the magnet URI Torznab handed it, atomically creates
 * a download with desiredState=queued, and returns promptly — no Telegram I/O.
 */
export function createGrabRelease(deps: GrabReleaseDeps) {
  const downloadForRelease = createDownloadForRelease(deps);
  return async function grabRelease(input: { magnetUri: string; category: string | null; now: number }): Promise<Download> {
    const releaseId = extractReleaseIdFromMagnetUri(input.magnetUri);
    if (releaseId === null) throw new InvalidMagnetUriError(input.magnetUri);
    return downloadForRelease(releaseId, input.category, input.now);
  };
}

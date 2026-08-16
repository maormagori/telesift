import type { ReleaseRepository } from "../../catalog/ports/release-repository.js";
import type { MediaAssetRepository } from "../../ingestion/ports/media-asset-repository.js";
import type { MessageRepository } from "../../ingestion/ports/message-repository.js";
import type { TelegramAccessPort } from "../../telegram-access/ports/telegram-access-port.js";
import type { Download } from "../domain/download.js";
import type { DownloadRepository } from "../ports/download-repository.js";
import type { StagingFilesystemPort } from "../ports/staging-filesystem-port.js";

export interface ProcessDownloadClaimDeps {
  releaseRepo: ReleaseRepository;
  mediaAssetRepo: MediaAssetRepository;
  messageRepo: MessageRepository;
  telegramAccess: TelegramAccessPort;
  staging: StagingFilesystemPort;
  downloadRepo: DownloadRepository;
  progressReportIntervalMs: number;
  leaseDurationMs: number;
}

/**
 * The worker's per-claim workflow. Reconciliation is not a separate pass: it
 * happens here, twice — once immediately after claim (before any Telegram I/O,
 * so a pause/cancel requested between claims short-circuits the transfer
 * entirely), and again on every progress-report tick during an active
 * transfer (so a pause/cancel requested mid-download is observed within one
 * report interval, not at lease-expiry granularity).
 */
export function createProcessDownloadClaim(deps: ProcessDownloadClaimDeps) {
  return async function processDownloadClaim(download: Download, workerId: string, now: number): Promise<void> {
    if (download.desiredState === "canceled") {
      if (download.stagingPath) await deps.staging.deleteFile(download.stagingPath);
      await deps.downloadRepo.cancel(download.id, workerId, now);
      return;
    }
    if (download.desiredState === "paused") {
      await deps.downloadRepo.pause(download.id, workerId, download.progressBytes, now);
      return;
    }

    const release = await deps.releaseRepo.findById(download.releaseId);
    if (!release) {
      await deps.downloadRepo.fail(download.id, workerId, "release_not_found", now);
      return;
    }
    const mediaAsset = await deps.mediaAssetRepo.findById(release.mediaAssetId);
    if (!mediaAsset) {
      await deps.downloadRepo.fail(download.id, workerId, "media_asset_not_found", now);
      return;
    }
    const message = await deps.messageRepo.findById(mediaAsset.messageId);
    if (!message) {
      await deps.downloadRepo.fail(download.id, workerId, "message_not_found", now);
      return;
    }

    // Grab-time verification: refetch before transferring, never trust a stored file reference.
    const summary = await deps.telegramAccess.getMessage(message.chatId, message.telegramMessageId);
    if (!summary?.media) {
      await deps.mediaAssetRepo.updateAvailability(mediaAsset.id, { availability: "unavailable", now });
      await deps.downloadRepo.fail(download.id, workerId, "media_unavailable", now);
      return;
    }

    const media = await deps.telegramAccess.getMediaStream(message.chatId, message.telegramMessageId);
    if (!media) {
      await deps.mediaAssetRepo.updateAvailability(mediaAsset.id, { availability: "unavailable", now });
      await deps.downloadRepo.fail(download.id, workerId, "media_unavailable", now);
      return;
    }
    await deps.mediaAssetRepo.updateAvailability(mediaAsset.id, { availability: "available", now });

    const fileName = media.descriptor.fileName ?? `download-${download.id}`;
    const stagingPath = download.stagingPath ?? deps.staging.buildPath(download.id, fileName);
    const resumeFromBytes = download.progressBytes > 0 ? await deps.staging.existingBytes(stagingPath) : 0;

    const controller = new AbortController();
    let lastReportedBytes = resumeFromBytes;

    const heartbeat = setInterval(() => {
      void (async () => {
        const desiredState = await deps.downloadRepo.reportProgress(download.id, workerId, {
          progressBytes: lastReportedBytes,
          totalBytes: media.descriptor.sizeBytes,
          stagingPath,
          now: Date.now(),
          leaseDurationMs: deps.leaseDurationMs,
        });
        // Lease lost (null) or desiredState moved off "queued" (paused/canceled requested): stop transferring.
        if (desiredState !== "queued") controller.abort();
      })();
    }, deps.progressReportIntervalMs);

    let result;
    try {
      result = await deps.staging.writeStream({
        source: media.stream,
        path: stagingPath,
        resumeFromBytes,
        signal: controller.signal,
        onProgress: (bytes) => {
          lastReportedBytes = bytes;
        },
      });
    } finally {
      clearInterval(heartbeat);
    }

    if (result.aborted) {
      const current = await deps.downloadRepo.findById(download.id);
      if (current?.desiredState === "canceled") {
        await deps.staging.deleteFile(stagingPath);
        await deps.downloadRepo.cancel(download.id, workerId, Date.now());
      } else {
        // Covers both an explicit pause request and a lost lease (the latter
        // is a harmless no-op: the guarded update won't match our workerId).
        await deps.downloadRepo.pause(download.id, workerId, result.bytesWritten, Date.now());
      }
      return;
    }

    await deps.downloadRepo.complete(download.id, workerId, stagingPath, result.bytesWritten, Date.now());
  };
}

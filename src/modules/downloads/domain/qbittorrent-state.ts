import type { Download } from "./download.js";

export type QbittorrentTorrentState = "downloading" | "pausedDL" | "pausedUP" | "checkingDL" | "error";

/**
 * `completed` maps to `pausedUP` (not `uploading`): Sonarr treats `pausedUP` as
 * both import-eligible and, with remove-completed-downloads enabled, safe to
 * remove after import. `uploading` reads as still-seeding and is never removed.
 * `canceled` downloads must be filtered out by the caller before reaching this
 * function — Sonarr should never see something the operator deleted.
 */
export function toQbittorrentState(download: Pick<Download, "observedState">): QbittorrentTorrentState {
  switch (download.observedState) {
    case "verifying":
      return "checkingDL";
    case "queued":
    case "downloading":
      return "downloading";
    case "paused":
      return "pausedDL";
    case "completed":
      return "pausedUP";
    case "failed":
      return "error";
    case "canceled":
      throw new Error("canceled downloads must be filtered out before mapping to a qBittorrent state");
  }
}

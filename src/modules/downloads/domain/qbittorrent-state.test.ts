import { describe, expect, it } from "vitest";
import type { DownloadObservedState } from "./download.js";
import { toQbittorrentState } from "./qbittorrent-state.js";

describe("toQbittorrentState", () => {
  const cases: [DownloadObservedState, string][] = [
    ["queued", "downloading"],
    ["verifying", "checkingDL"],
    ["downloading", "downloading"],
    ["paused", "pausedDL"],
    // completed -> pausedUP (not uploading) is load-bearing: it's what makes
    // Sonarr both import the file and, with remove-completed-downloads
    // enabled, later remove the entry.
    ["completed", "pausedUP"],
    ["failed", "error"],
  ];

  it.each(cases)("maps observedState %s to %s", (observedState, expected) => {
    expect(toQbittorrentState({ observedState })).toBe(expected);
  });

  it("throws for canceled — callers must filter canceled downloads out first", () => {
    expect(() => toQbittorrentState({ observedState: "canceled" })).toThrow();
  });
});

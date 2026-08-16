import { describe, expect, it } from "vitest";
import { extractReleaseIdFromMagnetUri, releaseIdToBtih, releaseIdToMagnetUri } from "./release-magnet.js";

describe("release magnet encoding", () => {
  it("is deterministic and 40 hex characters", () => {
    expect(releaseIdToBtih(42)).toBe(releaseIdToBtih(42));
    expect(releaseIdToBtih(42)).toMatch(/^[0-9a-f]{40}$/);
  });

  it("produces different hashes for different release ids", () => {
    expect(releaseIdToBtih(1)).not.toBe(releaseIdToBtih(2));
  });

  it("round-trips through a magnet URI", () => {
    const uri = releaseIdToMagnetUri(42);
    expect(uri).toBe(`magnet:?xt=urn:btih:${releaseIdToBtih(42)}&dn=42`);
    expect(extractReleaseIdFromMagnetUri(uri)).toBe(42);
  });

  it("returns null for a magnet with no dn param", () => {
    expect(extractReleaseIdFromMagnetUri("magnet:?xt=urn:btih:abc")).toBeNull();
  });

  it("returns null for a non-integer dn", () => {
    expect(extractReleaseIdFromMagnetUri("magnet:?xt=urn:btih:abc&dn=not-a-number")).toBeNull();
  });

  it("returns null for a non-positive dn", () => {
    expect(extractReleaseIdFromMagnetUri("magnet:?xt=urn:btih:abc&dn=0")).toBeNull();
    expect(extractReleaseIdFromMagnetUri("magnet:?xt=urn:btih:abc&dn=-1")).toBeNull();
  });

  it("returns null for a completely malformed uri", () => {
    expect(extractReleaseIdFromMagnetUri("not-a-magnet-uri")).toBeNull();
  });
});

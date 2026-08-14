import { describe, expect, it } from "vitest";
import { crossCheckExtraction } from "./cross-check.js";

function base(overrides: Partial<Parameters<typeof crossCheckExtraction>[0]> = {}) {
  return {
    extractionSeason: 4,
    extractionEpisode: 3,
    deterministicSeason: 4,
    deterministicEpisode: 3,
    extractionResolution: "1080p",
    assetHeight: 1080,
    ...overrides,
  };
}

describe("crossCheckExtraction", () => {
  it("passes when everything agrees", () => {
    expect(crossCheckExtraction(base())).toBe(true);
  });

  it("passes when the deterministic pre-pass found nothing to compare against", () => {
    expect(crossCheckExtraction(base({ deterministicSeason: null, deterministicEpisode: null }))).toBe(true);
  });

  it("fails when the deterministic season disagrees with the LLM's season", () => {
    expect(crossCheckExtraction(base({ deterministicSeason: 3 }))).toBe(false);
  });

  it("fails when the deterministic episode disagrees with the LLM's episode", () => {
    expect(crossCheckExtraction(base({ deterministicEpisode: 5 }))).toBe(false);
  });

  it("passes when resolution and asset height roughly agree within tolerance", () => {
    expect(crossCheckExtraction(base({ extractionResolution: "1080p", assetHeight: 1072 }))).toBe(true);
  });

  it("fails when the claimed resolution is far from the asset's actual height", () => {
    expect(crossCheckExtraction(base({ extractionResolution: "1080p", assetHeight: 480 }))).toBe(false);
  });

  it("passes when there is no asset height to check resolution against", () => {
    expect(crossCheckExtraction(base({ extractionResolution: "1080p", assetHeight: null }))).toBe(true);
  });
});

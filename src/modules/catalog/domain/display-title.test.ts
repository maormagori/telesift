import { describe, expect, it } from "vitest";
import { buildDisplayTitle } from "./display-title.js";

describe("buildDisplayTitle", () => {
  it("builds a full episode title", () => {
    expect(buildDisplayTitle({ seriesTitle: "Fauda", season: 4, episode: 3, resolution: "1080p" })).toBe(
      "Fauda.S04E03.1080p.Telegram",
    );
  });

  it("pads single-digit season/episode numbers", () => {
    expect(buildDisplayTitle({ seriesTitle: "Fauda", season: 1, episode: 1, resolution: null })).toBe(
      "Fauda.S01E01.Telegram",
    );
  });

  it("omits season/episode when either is missing", () => {
    expect(buildDisplayTitle({ seriesTitle: "Some Movie", season: null, episode: null, resolution: "720p" })).toBe(
      "Some.Movie.720p.Telegram",
    );
  });

  it("replaces internal whitespace in the series title with dots", () => {
    expect(buildDisplayTitle({ seriesTitle: "The Wire", season: 2, episode: 5, resolution: null })).toBe(
      "The.Wire.S02E05.Telegram",
    );
  });
});

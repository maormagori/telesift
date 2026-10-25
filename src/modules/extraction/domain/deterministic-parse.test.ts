import { describe, expect, it } from "vitest";
import { deterministicParse } from "./deterministic-parse.js";

describe("deterministicParse", () => {
  it("parses English SxxEyy from filename", () => {
    const result = deterministicParse({ text: null, fileName: "Fauda.S04E03.1080p.WEB-DL.x264.mkv" });
    expect(result).toEqual({
      season: 4,
      episode: 3,
      resolution: "1080p",
      source: "WEB-DL",
      codec: "x264",
      titleCandidate: "Fauda",
    });
  });

  it("parses SxxEyy case-insensitively from caption text", () => {
    const result = deterministicParse({ text: "פאודה s2e10 720p", fileName: null });
    expect(result.season).toBe(2);
    expect(result.episode).toBe(10);
    expect(result.resolution).toBe("720p");
  });

  it("parses Hebrew עונה/פרק from text", () => {
    const result = deterministicParse({ text: "פאודה עונה 3 פרק 7", fileName: null });
    expect(result.season).toBe(3);
    expect(result.episode).toBe(7);
  });

  it("prefers the English SxxEyy pattern over Hebrew when both present", () => {
    const result = deterministicParse({ text: "עונה 1 פרק 1 - S02E05", fileName: null });
    expect(result).toMatchObject({ season: 2, episode: 5 });
  });

  it("returns nulls when nothing matches", () => {
    const result = deterministicParse({ text: "just a caption with no metadata", fileName: "video.mp4" });
    expect(result).toEqual({
      season: null,
      episode: null,
      resolution: null,
      source: null,
      codec: null,
      titleCandidate: null,
    });
  });

  it("does not misparse a resolution dimension string like 1920x1080 as season/episode", () => {
    const result = deterministicParse({ text: "Raw dump 1920x1080 mp4", fileName: null });
    expect(result.season).toBeNull();
    expect(result.episode).toBeNull();
  });

  it("extracts source and codec independently of season/episode", () => {
    const result = deterministicParse({ text: null, fileName: "Movie.2023.2160p.BluRay.HEVC.mkv" });
    expect(result).toEqual({
      season: null,
      episode: null,
      resolution: "2160p",
      source: "BluRay",
      codec: "hevc",
      titleCandidate: null,
    });
  });

  it("takes the scene-style title from the segment before the SxxEyy marker", () => {
    expect(deterministicParse({ text: null, fileName: "The.Bear.S03E01.1080p.WEB-DL.mkv" }).titleCandidate).toBe(
      "The Bear",
    );
    expect(deterministicParse({ text: null, fileName: "Some_Show_S01E02_720p.mkv" }).titleCandidate).toBe("Some Show");
  });

  it("has no title candidate for filenames that are not scene-style", () => {
    expect(deterministicParse({ text: null, fileName: "video.mp4" }).titleCandidate).toBeNull();
    expect(deterministicParse({ text: null, fileName: "aBcD1234.mkv" }).titleCandidate).toBeNull();
    expect(deterministicParse({ text: "פאודה עונה 2 פרק 4", fileName: null }).titleCandidate).toBeNull();
  });

  it("has no title candidate when the marker starts the filename, leaving no title segment", () => {
    expect(deterministicParse({ text: null, fileName: "S04E03.1080p.mkv" }).titleCandidate).toBeNull();
  });
});

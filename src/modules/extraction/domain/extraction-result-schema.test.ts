import { describe, expect, it } from "vitest";
import { extractionResultSchema } from "./extraction-result-schema.js";

const VALID_RESULT = {
  isTvEpisode: true,
  seriesTitleObserved: "Fauda",
  seriesTitleCanonical: "Fauda",
  matchedSeriesId: 1,
  season: 4,
  episode: 3,
  resolution: "1080p",
  source: "WEB-DL",
  codec: "x264",
  language: "he",
  evidence: {
    season: [{ messageId: 1, source: "filename" }],
  },
  ambiguities: [],
  recommendedState: "index",
};

describe("extractionResultSchema", () => {
  it("accepts a fully-populated valid result", () => {
    expect(extractionResultSchema.parse(VALID_RESULT)).toEqual(VALID_RESULT);
  });

  it("accepts a non-episode movie result with null season/episode", () => {
    const movie = {
      ...VALID_RESULT,
      isTvEpisode: false,
      season: null,
      episode: null,
      recommendedState: "review",
    };
    expect(() => extractionResultSchema.parse(movie)).not.toThrow();
  });

  it("rejects a missing required field", () => {
    const missingField: Record<string, unknown> = { ...VALID_RESULT };
    delete missingField.isTvEpisode;
    expect(() => extractionResultSchema.parse(missingField)).toThrow();
  });

  it("rejects an invalid recommendedState enum value", () => {
    expect(() => extractionResultSchema.parse({ ...VALID_RESULT, recommendedState: "auto_grab" })).toThrow();
  });

  it("rejects an invalid evidence source", () => {
    expect(() =>
      extractionResultSchema.parse({
        ...VALID_RESULT,
        evidence: { season: [{ messageId: 1, source: "chain_of_thought" }] },
      }),
    ).toThrow();
  });

  it("rejects a non-array ambiguities field", () => {
    expect(() => extractionResultSchema.parse({ ...VALID_RESULT, ambiguities: "none" })).toThrow();
  });
});

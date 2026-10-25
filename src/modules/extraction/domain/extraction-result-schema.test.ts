import { describe, expect, it } from "vitest";
import { extractionResultSchema, renderFieldDescriptions } from "./extraction-result-schema.js";

const VALID_RESULT = {
  isTvEpisode: true,
  seriesTitleObserved: "Fauda",
  season: 4,
  episode: 3,
  language: "he",
  ambiguities: [],
  recommendedState: "index",
};

describe("extractionResultSchema", () => {
  it("accepts a fully-populated valid result", () => {
    expect(extractionResultSchema.parse(VALID_RESULT)).toEqual(VALID_RESULT);
  });

  it("accepts a non-episode result with null season/episode", () => {
    const movie = { ...VALID_RESULT, isTvEpisode: false, season: null, episode: null, recommendedState: "review" };
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

  it("rejects a non-array ambiguities field", () => {
    expect(() => extractionResultSchema.parse({ ...VALID_RESULT, ambiguities: "none" })).toThrow();
  });

  it("rejects season/episode outside plausible bounds, so a garbled number triggers a retry", () => {
    expect(() => extractionResultSchema.parse({ ...VALID_RESULT, season: -1 })).toThrow();
    expect(() => extractionResultSchema.parse({ ...VALID_RESULT, season: 5000 })).toThrow();
    expect(() => extractionResultSchema.parse({ ...VALID_RESULT, episode: 999_999 })).toThrow();
    expect(() => extractionResultSchema.parse({ ...VALID_RESULT, episode: 1.5 })).toThrow();
  });

  it("accepts any ISO 639-1 code, not just the languages seen so far", () => {
    for (const language of ["he", "en", "ru", "ar", "mixed", null]) {
      expect(() => extractionResultSchema.parse({ ...VALID_RESULT, language })).not.toThrow();
    }
  });

  it("rejects a language that is not a two-letter code", () => {
    expect(() => extractionResultSchema.parse({ ...VALID_RESULT, language: "Hebrew" })).toThrow();
  });
});

describe("renderFieldDescriptions", () => {
  it("describes every field in the schema, so the prompt cannot drift from it", () => {
    const rendered = renderFieldDescriptions();
    for (const field of Object.keys(extractionResultSchema.shape)) {
      expect(rendered).toContain(field);
    }
  });

  it("renders each field's type alongside its description", () => {
    const rendered = renderFieldDescriptions();
    expect(rendered).toContain("isTvEpisode (boolean)");
    expect(rendered).toContain("seriesTitleObserved (string | null)");
    expect(rendered).toContain("ambiguities (string[])");
    expect(rendered).toContain('recommendedState ("index" | "review")');
  });

  it("states the grounding contract that materialization enforces", () => {
    expect(renderFieldDescriptions()).toContain("verbatim");
  });
});

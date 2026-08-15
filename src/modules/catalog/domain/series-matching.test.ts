import { describe, expect, it } from "vitest";
import { normalizeAliasText, resolveSeries, similarityScore } from "./series-matching.js";

describe("normalizeAliasText", () => {
  it("lowercases and strips punctuation", () => {
    expect(normalizeAliasText("Fauda!!")).toBe("fauda");
  });

  it("collapses whitespace", () => {
    expect(normalizeAliasText("  The   Wire ")).toBe("the wire");
  });

  it("preserves Hebrew letters", () => {
    expect(normalizeAliasText("פאודה")).toBe("פאודה");
  });
});

describe("similarityScore", () => {
  it("is 1 for identical strings", () => {
    expect(similarityScore("fauda", "fauda")).toBe(1);
  });

  it("is lower for very different strings", () => {
    expect(similarityScore("fauda", "the wire")).toBeLessThan(0.3);
  });
});

describe("resolveSeries", () => {
  const candidates = [
    { seriesId: 1, aliasNormalized: "fauda" },
    { seriesId: 2, aliasNormalized: "the wire" },
  ];

  it("matches an observed title with a minor spelling variant above threshold", () => {
    const result = resolveSeries("Fauda ", null, candidates, 0.8);
    expect(result).toEqual({ seriesId: 1, isNewCandidate: false, score: 1 });
  });

  it("falls back to the filename slug when the observed title is null", () => {
    const result = resolveSeries(null, "fauda.s04e03", candidates, 0.5);
    expect(result.seriesId).toBe(1);
    expect(result.isNewCandidate).toBe(false);
  });

  it("flags an unrecognized title as a new candidate below threshold", () => {
    const result = resolveSeries("Some Unknown Show", null, candidates, 0.8);
    expect(result).toEqual({ seriesId: null, isNewCandidate: true, score: expect.any(Number) });
  });

  it("flags as a new candidate when there are no local candidates at all", () => {
    const result = resolveSeries("Fauda", null, [], 0.8);
    expect(result).toEqual({ seriesId: null, isNewCandidate: true, score: 0 });
  });

  it("flags as a new candidate when no title or filename is available", () => {
    const result = resolveSeries(null, null, candidates, 0.8);
    expect(result).toEqual({ seriesId: null, isNewCandidate: true, score: 0 });
  });
});

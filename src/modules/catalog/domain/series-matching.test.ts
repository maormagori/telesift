import { describe, expect, it } from "vitest";
import { matchSeriesAliases, normalizeAliasText, resolveSeries, similarityScore } from "./series-matching.js";

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

describe("matchSeriesAliases", () => {
  const candidates = [
    { seriesId: 1, aliasNormalized: "fauda" },
    { seriesId: 1, aliasNormalized: "פאודה" },
    { seriesId: 2, aliasNormalized: "the wire" },
  ];

  it("matches an exact alias above threshold", () => {
    expect(matchSeriesAliases("Fauda", candidates, 0.85)).toEqual([{ seriesId: 1, score: 1 }]);
  });

  it("takes the max score across a series's multiple aliases", () => {
    // "fauda" scores 1 against the English alias but low against the Hebrew one —
    // the series should still surface once, at its best score.
    const result = matchSeriesAliases("fauda", candidates, 0.85);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ seriesId: 1, score: 1 });
  });

  it("excludes series scoring below threshold", () => {
    expect(matchSeriesAliases("some unknown show", candidates, 0.85)).toEqual([]);
  });

  it("returns every series at/above threshold, best first", () => {
    const closeCandidates = [
      { seriesId: 1, aliasNormalized: "fauda" },
      { seriesId: 2, aliasNormalized: "fauda 2" },
    ];
    const result = matchSeriesAliases("fauda", closeCandidates, 0.5);
    expect(result.map((r) => r.seriesId)).toEqual([1, 2]);
    expect(result[0]!.score).toBeGreaterThanOrEqual(result[1]!.score);
  });

  it("returns no matches for a blank query", () => {
    expect(matchSeriesAliases("   ", candidates, 0.5)).toEqual([]);
  });

  it("returns no matches when there are no candidates", () => {
    expect(matchSeriesAliases("fauda", [], 0.5)).toEqual([]);
  });
});

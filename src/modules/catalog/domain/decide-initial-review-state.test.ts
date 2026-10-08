import { describe, expect, it } from "vitest";
import type { ExtractionResult } from "../../extraction/domain/extraction-result-schema.js";
import { decideInitialReviewState } from "./decide-initial-review-state.js";

function baseExtraction(overrides: Partial<ExtractionResult> = {}): ExtractionResult {
  return {
    isTvEpisode: true,
    seriesTitleObserved: "Fauda",
    season: 4,
    episode: 3,
    language: "he",
    ambiguities: [],
    recommendedState: "index",
    ...overrides,
  };
}

const CONFIDENT_INPUT = {
  extraction: baseExtraction(),
  isNewSeriesCandidate: false,
  seriesTitleGrounded: true,
  crossCheckOk: true,
  autoIndexEnabled: true,
};

describe("decideInitialReviewState", () => {
  it("auto-approves a confident, unambiguous, matched-series extraction", () => {
    expect(decideInitialReviewState(CONFIDENT_INPUT)).toBe("approved");
  });

  it("sends non-tv-episode extractions to pending_review", () => {
    expect(
      decideInitialReviewState({ ...CONFIDENT_INPUT, extraction: baseExtraction({ isTvEpisode: false }) }),
    ).toBe("pending_review");
  });

  it("sends a recommendedState other than index to pending_review", () => {
    expect(
      decideInitialReviewState({ ...CONFIDENT_INPUT, extraction: baseExtraction({ recommendedState: "review" }) }),
    ).toBe("pending_review");
  });

  it("sends an ungrounded series title to pending_review", () => {
    expect(decideInitialReviewState({ ...CONFIDENT_INPUT, seriesTitleGrounded: false })).toBe("pending_review");
  });

  it("sends any ambiguity to pending_review even when recommendedState is index", () => {
    expect(
      decideInitialReviewState({
        ...CONFIDENT_INPUT,
        extraction: baseExtraction({ ambiguities: ["filename and caption disagree on season"] }),
      }),
    ).toBe("pending_review");
  });

  it("sends a newly auto-created series candidate to pending_review", () => {
    expect(decideInitialReviewState({ ...CONFIDENT_INPUT, isNewSeriesCandidate: true })).toBe("pending_review");
  });

  it("sends a mechanical cross-check conflict to pending_review", () => {
    expect(decideInitialReviewState({ ...CONFIDENT_INPUT, crossCheckOk: false })).toBe("pending_review");
  });

  it("sends everything to pending_review when auto-index is disabled", () => {
    expect(decideInitialReviewState({ ...CONFIDENT_INPUT, autoIndexEnabled: false })).toBe("pending_review");
  });
});

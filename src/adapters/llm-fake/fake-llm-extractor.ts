import type { LlmExtractionInput, LlmExtractor } from "../../modules/extraction/ports/llm-extractor.js";
import { NEGATIVE_RESULT } from "./fixtures.js";

export type LlmFakeResponder = (input: LlmExtractionInput) => unknown;

export interface FakeLlmExtractor extends LlmExtractor {
  readonly callCount: number;
}

/**
 * A heuristic default for local dev without a real LLM configured: reports a TV episode only
 * when the deterministic pre-pass already found a season/episode, and always recommends
 * `review` rather than `index` since it has no real judgment to offer.
 */
function defaultResponder(input: LlmExtractionInput): unknown {
  const { season, episode, resolution, source, codec } = input.deterministicHints;
  if (season === null || episode === null) return NEGATIVE_RESULT;

  return {
    isTvEpisode: true,
    seriesTitleObserved: input.fileName,
    seriesTitleCanonical: input.fileName,
    matchedSeriesId: null,
    season,
    episode,
    resolution,
    source,
    codec,
    language: null,
    evidence: {},
    ambiguities: [],
    recommendedState: "review",
  };
}

export function createFakeLlmExtractor(responder: LlmFakeResponder = defaultResponder): FakeLlmExtractor {
  let callCount = 0;
  return {
    get callCount() {
      return callCount;
    },
    async extract(input) {
      callCount += 1;
      return responder(input);
    },
  };
}

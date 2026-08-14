import type { ExtractionResult } from "../../extraction/domain/extraction-result-schema.js";
import type { ReleaseReviewState } from "./release.js";

export interface DecideInitialReviewStateInput {
  extraction: ExtractionResult;
  isNewSeriesCandidate: boolean;
  crossCheckOk: boolean;
  autoIndexEnabled: boolean;
}

/**
 * The LLM's `recommendedState` is advisory input, not the decision itself (AGENTS.md: "Do not
 * let the LLM mark its own result verified"). A release only auto-enters `approved` when every
 * independently-checkable signal agrees; anything uncertain lands in `pending_review`.
 */
export function decideInitialReviewState(input: DecideInitialReviewStateInput): ReleaseReviewState {
  if (!input.autoIndexEnabled) return "pending_review";
  if (!input.extraction.isTvEpisode) return "pending_review";
  if (input.extraction.recommendedState !== "index") return "pending_review";
  if (input.extraction.ambiguities.length > 0) return "pending_review";
  if (input.isNewSeriesCandidate) return "pending_review";
  if (!input.crossCheckOk) return "pending_review";
  return "approved";
}

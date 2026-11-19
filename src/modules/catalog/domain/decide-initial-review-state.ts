import type { ExtractionResult } from "../../extraction/domain/extraction-result-schema.js";
import type { ReleaseReviewState } from "./release.js";

export interface DecideInitialReviewStateInput {
  extraction: ExtractionResult;
  seriesTitleGrounded: boolean;
  crossCheckOk: boolean;
  autoIndexEnabled: boolean;
}

/**
 * The LLM's `recommendedState` is advisory input, not the decision itself (docs/product.md: the
 * model cannot verify its own answer). A release only auto-enters `approved` when every
 * independently-checkable signal agrees; anything uncertain lands in `pending_review`. A series
 * being new is not uncertainty: a grounded title for a show we have not seen before auto-approves.
 */
export function decideInitialReviewState(input: DecideInitialReviewStateInput): ReleaseReviewState {
  if (!input.autoIndexEnabled) return "pending_review";
  if (!input.extraction.isTvEpisode) return "pending_review";
  if (!input.seriesTitleGrounded) return "pending_review";
  if (input.extraction.recommendedState !== "index") return "pending_review";
  if (input.extraction.ambiguities.length > 0) return "pending_review";
  if (!input.crossCheckOk) return "pending_review";
  return "approved";
}

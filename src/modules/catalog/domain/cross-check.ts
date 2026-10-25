export interface CrossCheckInput {
  extractionSeason: number | null;
  extractionEpisode: number | null;
  deterministicSeason: number | null;
  deterministicEpisode: number | null;
}

/**
 * Mechanically-checkable claims per docs/product.md: the deterministic pre-pass and the LLM should
 * agree on season/episode when both found one.
 *
 * Resolution is no longer checked here. It used to compare the LLM's claimed resolution against the
 * video's actual height, but resolution is now derived from that height (or from a filename tag)
 * rather than claimed by the model, so the comparison would only check a value against its own
 * source.
 */
export function crossCheckExtraction(input: CrossCheckInput): boolean {
  if (
    input.deterministicSeason !== null &&
    input.extractionSeason !== null &&
    input.deterministicSeason !== input.extractionSeason
  ) {
    return false;
  }
  if (
    input.deterministicEpisode !== null &&
    input.extractionEpisode !== null &&
    input.deterministicEpisode !== input.extractionEpisode
  ) {
    return false;
  }
  return true;
}

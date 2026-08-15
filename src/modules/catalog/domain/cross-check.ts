export interface CrossCheckInput {
  extractionSeason: number | null;
  extractionEpisode: number | null;
  deterministicSeason: number | null;
  deterministicEpisode: number | null;
  extractionResolution: string | null;
  assetHeight: number | null;
}

const RESOLUTION_HEIGHTS: Record<string, number> = {
  "2160p": 2160,
  "1080p": 1080,
  "720p": 720,
  "480p": 480,
  "360p": 360,
};

const RESOLUTION_TOLERANCE = 0.15;

/**
 * Mechanically-checkable claims per AGENTS.md's extraction-pipeline step 5: the deterministic
 * pre-pass and the LLM should agree on season/episode when both found one, and a claimed
 * resolution should roughly match the video's actual height when both are known.
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
  if (input.extractionResolution && input.assetHeight) {
    const expectedHeight = RESOLUTION_HEIGHTS[input.extractionResolution.toLowerCase()];
    if (expectedHeight && Math.abs(expectedHeight - input.assetHeight) / expectedHeight > RESOLUTION_TOLERANCE) {
      return false;
    }
  }
  return true;
}

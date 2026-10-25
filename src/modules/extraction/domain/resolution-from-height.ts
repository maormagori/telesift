const RESOLUTION_LADDER: { label: string; height: number }[] = [
  { label: "2160p", height: 2160 },
  { label: "1080p", height: 1080 },
  { label: "720p", height: 720 },
  { label: "480p", height: 480 },
  { label: "360p", height: 360 },
];

const HEIGHT_TOLERANCE = 0.15;

/**
 * Maps a video's pixel height to a resolution label. Letterboxing and non-standard encodes mean the
 * height rarely lands exactly on a rung, so the nearest rung within tolerance wins.
 *
 * This used to be asked of the LLM, which supplied it by reading width/height out of the input --
 * a lookup, not a judgment, and one the model could get wrong.
 */
export function resolutionFromHeight(height: number | null): string | null {
  if (height === null || height <= 0) return null;
  for (const rung of RESOLUTION_LADDER) {
    if (Math.abs(rung.height - height) / rung.height <= HEIGHT_TOLERANCE) return rung.label;
  }
  return null;
}

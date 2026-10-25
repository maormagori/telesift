export interface DeterministicParseInput {
  text: string | null;
  fileName: string | null;
}

export interface DeterministicParseResult {
  season: number | null;
  episode: number | null;
  resolution: string | null;
  source: string | null;
  codec: string | null;
  titleCandidate: string | null;
}

// `\b` does not fire between `_` and `S` (both are word characters), which silently missed the
// underscore-separated filenames Telegram sources produce, e.g. `Show_2026_S05E11_1080p.mp4`.
const SEASON_EPISODE_PATTERN = /(?:^|[^\p{L}\p{N}])S(\d{1,2})E(\d{1,3})(?![\p{L}\p{N}])/iu;
const HEBREW_SEASON_PATTERN = /עונה\s*(\d{1,2})/;
const HEBREW_EPISODE_PATTERN = /פרק\s*(\d{1,3})/;
const RESOLUTION_PATTERN = /\b(2160p|1080p|720p|480p|360p)\b/i;
const SOURCE_PATTERN = /\b(WEB-?DL|WEBRip|BluRay|BDRip|HDTV|DVDRip|HDRip)\b/i;
const CODEC_PATTERN = /\b(x264|x265|h\.?264|h\.?265|hevc|avc)\b/i;

function firstMatch(pattern: RegExp, haystacks: string[]): RegExpMatchArray | null {
  for (const haystack of haystacks) {
    const match = haystack.match(pattern);
    if (match) return match;
  }
  return null;
}

/**
 * Scene release naming (`Title.S05E10.1080p.WEB-DL.x264-GROUP`) is an industry-wide convention, not
 * one channel's formatting, so the segment before the SxxExx marker is a mechanically-available
 * title. Returns null for filenames that do not follow it, including bare slugs like `index.mp4`.
 */
function sceneTitleCandidate(fileName: string | null): string | null {
  if (fileName === null) return null;
  const marker = fileName.match(SEASON_EPISODE_PATTERN);
  if (!marker || marker.index === undefined || marker.index === 0) return null;
  const title = fileName
    .slice(0, marker.index)
    .replace(/[._]+/g, " ")
    .trim();
  return title.length > 0 ? title : null;
}

export function deterministicParse(input: DeterministicParseInput): DeterministicParseResult {
  const haystacks = [input.text, input.fileName].filter((value): value is string => value !== null);

  const seasonEpisode = firstMatch(SEASON_EPISODE_PATTERN, haystacks);
  const hebrewSeason = firstMatch(HEBREW_SEASON_PATTERN, haystacks);
  const hebrewEpisode = firstMatch(HEBREW_EPISODE_PATTERN, haystacks);
  const resolution = firstMatch(RESOLUTION_PATTERN, haystacks);
  const source = firstMatch(SOURCE_PATTERN, haystacks);
  const codec = firstMatch(CODEC_PATTERN, haystacks);

  return {
    season: seasonEpisode ? Number(seasonEpisode[1]!) : hebrewSeason ? Number(hebrewSeason[1]!) : null,
    episode: seasonEpisode ? Number(seasonEpisode[2]!) : hebrewEpisode ? Number(hebrewEpisode[1]!) : null,
    resolution: resolution ? resolution[1]!.toLowerCase() : null,
    source: source ? (source[1] ?? null) : null,
    codec: codec ? codec[1]!.toLowerCase() : null,
    titleCandidate: sceneTitleCandidate(input.fileName),
  };
}

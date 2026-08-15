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
}

const SEASON_EPISODE_PATTERN = /\bS(\d{1,2})E(\d{1,3})\b/i;
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
  };
}

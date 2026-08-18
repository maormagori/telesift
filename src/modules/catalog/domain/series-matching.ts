const DIACRITIC_PATTERN = /[\u0300-\u036f\u0591-\u05bd\u05bf\u05c1\u05c2\u05c4\u05c5\u05c7]/gu;
const NON_ALPHANUMERIC_PATTERN = /[^\p{L}\p{N}]+/gu;

export function normalizeAliasText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(DIACRITIC_PATTERN, "")
    .toLowerCase()
    .replace(NON_ALPHANUMERIC_PATTERN, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function levenshteinDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
  for (let i = 0; i < rows; i++) dp[i]![0] = i;
  for (let j = 0; j < cols; j++) dp[0]![j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
      const dpRowI = dp[i]!;
      const dpRowIMinus1 = dp[i - 1]!;
      dpRowI[j] = Math.min(dpRowIMinus1[j]! + 1, dpRowI[j - 1]! + 1, dpRowIMinus1[j - 1]! + cost);
    }
  }
  return dp[a.length]![b.length]!;
}

export function similarityScore(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshteinDistance(a, b) / maxLen;
}

/**
 * A filename slug is usually much longer than the alias it should match (title plus
 * season/episode/quality/codec tokens), so a whole-string comparison scores it as dissimilar
 * even on an exact title match. Slide a window the size of the alias over the query's words and
 * take the best-matching window instead.
 */
function bestMatchScore(query: string, alias: string): number {
  const aliasWords = alias.split(" ").filter(Boolean);
  const queryWords = query.split(" ").filter(Boolean);
  if (aliasWords.length === 0 || queryWords.length <= aliasWords.length) {
    return similarityScore(query, alias);
  }

  let best = 0;
  for (let start = 0; start <= queryWords.length - aliasWords.length; start++) {
    const window = queryWords.slice(start, start + aliasWords.length).join(" ");
    best = Math.max(best, similarityScore(window, alias));
  }
  return best;
}

export interface SeriesMatchCandidate {
  seriesId: number;
  aliasNormalized: string;
}

export interface SeriesMatchResult {
  seriesId: number | null;
  isNewCandidate: boolean;
  score: number;
}

export interface SeriesAliasMatch {
  seriesId: number;
  score: number;
}

/**
 * The Torznab search variant of resolveSeries: a query may legitimately match more than
 * one local series, and unlike extraction there is no "create a new candidate" fallback
 * — an unmatched query simply returns zero results, so precision matters more here than
 * in resolveSeries's single-best-match, safe-fallback semantics. Returns every series
 * scoring at/above the threshold (max score across its aliases), best first.
 */
export function matchSeriesAliases(queryText: string, candidates: SeriesMatchCandidate[], threshold: number): SeriesAliasMatch[] {
  const query = normalizeAliasText(queryText);
  if (query.length === 0 || candidates.length === 0) return [];

  const bestScoreBySeriesId = new Map<number, number>();
  for (const candidate of candidates) {
    const score = bestMatchScore(query, candidate.aliasNormalized);
    const current = bestScoreBySeriesId.get(candidate.seriesId);
    if (current === undefined || score > current) bestScoreBySeriesId.set(candidate.seriesId, score);
  }

  return [...bestScoreBySeriesId.entries()]
    .filter(([, score]) => score >= threshold)
    .map(([seriesId, score]) => ({ seriesId, score }))
    .sort((a, b) => b.score - a.score);
}

export function resolveSeries(
  observedTitle: string | null,
  filenameSlug: string | null,
  candidates: SeriesMatchCandidate[],
  threshold: number,
): SeriesMatchResult {
  const queries = [observedTitle, filenameSlug]
    .filter((value): value is string => Boolean(value && value.trim().length > 0))
    .map(normalizeAliasText);

  if (queries.length === 0 || candidates.length === 0) {
    return { seriesId: null, isNewCandidate: true, score: 0 };
  }

  let best: { seriesId: number; score: number } | null = null;
  for (const query of queries) {
    for (const candidate of candidates) {
      const score = bestMatchScore(query, candidate.aliasNormalized);
      if (!best || score > best.score) best = { seriesId: candidate.seriesId, score };
    }
  }

  if (best && best.score >= threshold) {
    return { seriesId: best.seriesId, isNewCandidate: false, score: best.score };
  }
  return { seriesId: null, isNewCandidate: true, score: best?.score ?? 0 };
}

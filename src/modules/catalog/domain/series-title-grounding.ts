import { normalizeAliasText } from "./series-matching.js";

export interface SeriesTitleGroundingInput {
  observedTitle: string | null;
  contextTexts: (string | null)[];
  fileName: string | null;
}

export type SeriesTitleGroundingResult =
  | { grounded: true; title: string }
  | { grounded: false; reason: "missing" | "no_letters" | "not_in_source" };

const LETTER_PATTERN = /\p{L}/u;

/**
 * `seriesTitleObserved` means "the title as it appears in the message" -- so a title that does not
 * appear in the message text or filename was not observed, it was invented. This is the schema's
 * stated contract (see the field's `.describe()`), enforced.
 *
 * It is the only check that catches a model being confidently wrong: in the real audit data 20 of
 * 95 runs returned a title absent from their own source, including one that reported no
 * ambiguities and recommended indexing while naming an entirely unrelated show.
 */
export function checkSeriesTitleGrounding(input: SeriesTitleGroundingInput): SeriesTitleGroundingResult {
  if (input.observedTitle === null || input.observedTitle.trim().length === 0) {
    return { grounded: false, reason: "missing" };
  }

  // A title of pure punctuation (`" (^)( *)?"` appears in the real data) normalizes to the empty
  // string, which every haystack trivially contains.
  if (!LETTER_PATTERN.test(input.observedTitle)) {
    return { grounded: false, reason: "no_letters" };
  }

  const needle = normalizeAliasText(input.observedTitle);
  if (needle.length === 0) return { grounded: false, reason: "no_letters" };

  const haystack = normalizeAliasText(
    [...input.contextTexts, input.fileName].filter((value): value is string => value !== null).join(" "),
  );

  if (!haystack.includes(needle)) return { grounded: false, reason: "not_in_source" };

  return { grounded: true, title: input.observedTitle.trim().replace(/\s+/g, " ") };
}

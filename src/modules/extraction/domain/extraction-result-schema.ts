import { z } from "zod";

// Deliberately not an enum of known languages: channels come from anywhere, so the set is open.
const languageSchema = z
  .string()
  .regex(/^([a-z]{2}|mixed)$/)
  .nullable();

const recommendedStateSchema = z.enum(["index", "review"]);

/**
 * The shape the LLM must return, and the single source of truth for what each field means.
 *
 * Every `.describe()` here is rendered into the extractor's system prompt by
 * `renderFieldDescriptions`, so the prompt cannot drift from the schema. Any rule a downstream
 * validator enforces must have a stated counterpart in one of these descriptions — otherwise the
 * model is being judged against a contract it was never given.
 */
export const extractionResultSchema = z.object({
  isTvEpisode: z
    .boolean()
    .describe(
      "True only when this media is a single episode of an episodic TV series. False for films, trailers, promotional posts, advertisements, channel announcements, and anything else that is not one episode.",
    ),
  seriesTitleObserved: z
    .string()
    .nullable()
    .describe(
      "The series title exactly as it appears in the message text or filename. Copy it verbatim: do not translate, transliterate, correct spelling, or reformat it. Exclude season and episode markers and quality tags. If no series title appears in the text or filename, return null; never infer or guess one.",
    ),
  season: z
    .number()
    .int()
    .min(0)
    .max(100)
    .nullable()
    .describe("The season number as written in the text or filename. Null if no season is stated."),
  episode: z
    .number()
    .int()
    .min(0)
    .max(10000)
    .nullable()
    .describe("The episode number as written in the text or filename. Null if no episode is stated."),
  language: languageSchema.describe(
    'The language of the message, as a lowercase ISO 639-1 two-letter code. Infer it from everything available to you: the message text, the filename, and the channel name. Use "mixed" when more than one language appears substantially. Null when it cannot be determined.',
  ),
  ambiguities: z
    .array(z.string())
    .describe(
      "Short notes naming anything genuinely unclear about this extraction, such as two different titles appearing in the context. Leave empty when the extraction is unambiguous; do not add a note to express general caution.",
    ),
  recommendedState: recommendedStateSchema.describe(
    'Advisory only. "index" when the extraction looks complete and unambiguous, "review" when a human should check it.',
  ),
});

export type ExtractionResult = z.infer<typeof extractionResultSchema>;
export type RecommendedState = z.infer<typeof recommendedStateSchema>;

function jsonTypeOf(schema: z.ZodTypeAny): string {
  if (schema instanceof z.ZodNullable) return `${jsonTypeOf(schema.unwrap() as z.ZodTypeAny)} | null`;
  if (schema instanceof z.ZodArray) return `${jsonTypeOf(schema.element as z.ZodTypeAny)}[]`;
  if (schema instanceof z.ZodEnum) return (schema.options as string[]).map((option) => `"${option}"`).join(" | ");
  if (schema instanceof z.ZodString) return "string";
  if (schema instanceof z.ZodNumber) return "number";
  if (schema instanceof z.ZodBoolean) return "boolean";
  return "unknown";
}

/**
 * Renders the schema's field descriptions as prompt text, so the instructions the model receives
 * are generated from the schema rather than hand-duplicated alongside it.
 */
export function renderFieldDescriptions(): string {
  return Object.entries(extractionResultSchema.shape)
    .map(([name, field]) => {
      const schema = field as z.ZodTypeAny;
      return `- ${name} (${jsonTypeOf(schema)}): ${schema.description ?? ""}`;
    })
    .join("\n");
}

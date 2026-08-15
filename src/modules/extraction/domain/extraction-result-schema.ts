import { z } from "zod";

const evidenceSourceSchema = z.enum(["text", "filename", "media.width", "media.height"]);

const evidenceEntrySchema = z.object({
  messageId: z.number().int(),
  source: evidenceSourceSchema,
});

const languageSchema = z.enum(["he", "en", "mixed"]).nullable();

const recommendedStateSchema = z.enum(["index", "review", "unresolved", "needs_more_context"]);

export const extractionResultSchema = z.object({
  isTvEpisode: z.boolean(),
  seriesTitleObserved: z.string().nullable(),
  seriesTitleCanonical: z.string().nullable(),
  matchedSeriesId: z.number().int().nullable(),
  season: z.number().int().nullable(),
  episode: z.number().int().nullable(),
  resolution: z.string().nullable(),
  source: z.string().nullable(),
  codec: z.string().nullable(),
  language: languageSchema,
  evidence: z.record(z.string(), z.array(evidenceEntrySchema)),
  ambiguities: z.array(z.string()),
  recommendedState: recommendedStateSchema,
});

export type ExtractionResult = z.infer<typeof extractionResultSchema>;
export type EvidenceEntry = z.infer<typeof evidenceEntrySchema>;
export type RecommendedState = z.infer<typeof recommendedStateSchema>;

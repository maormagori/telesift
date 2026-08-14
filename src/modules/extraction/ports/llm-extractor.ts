export interface LlmContextMessage {
  messageId: number;
  role: "target" | "preceding" | "reply" | "album_sibling";
  relativeOrder: number;
  text: string | null;
}

export interface LlmSeriesCandidate {
  seriesId: number;
  canonicalTitle: string;
  aliases: string[];
}

export interface LlmExtractionInput {
  channelTitle: string;
  channelUsername: string | null;
  targetMessageId: number;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  contextMessages: LlmContextMessage[];
  deterministicHints: {
    season: number | null;
    episode: number | null;
    resolution: string | null;
    source: string | null;
    codec: string | null;
  };
  knownSeriesCandidates: LlmSeriesCandidate[];
}

export interface LlmExtractor {
  /** Returns raw, not-yet-validated JSON. Callers validate against extractionResultSchema. */
  extract(input: LlmExtractionInput): Promise<unknown>;
}

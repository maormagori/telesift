import type { ExtractionResult } from "../../modules/extraction/domain/extraction-result-schema.js";

export const CONFIDENT_EPISODE_RESULT: ExtractionResult = {
  isTvEpisode: true,
  seriesTitleObserved: "Fauda",
  seriesTitleCanonical: "Fauda",
  matchedSeriesId: null,
  season: 4,
  episode: 3,
  resolution: "1080p",
  source: "WEB-DL",
  codec: "x264",
  language: "he",
  evidence: {
    season: [{ messageId: 1, source: "filename" }],
    episode: [{ messageId: 1, source: "filename" }],
  },
  ambiguities: [],
  recommendedState: "index",
};

export const AMBIGUOUS_EPISODE_RESULT: ExtractionResult = {
  isTvEpisode: true,
  seriesTitleObserved: "Some Show",
  seriesTitleCanonical: "Some Show",
  matchedSeriesId: null,
  season: 1,
  episode: 1,
  resolution: null,
  source: null,
  codec: null,
  language: "en",
  evidence: {},
  ambiguities: ["caption and filename disagree on episode number"],
  recommendedState: "review",
};

export const NEGATIVE_RESULT: ExtractionResult = {
  isTvEpisode: false,
  seriesTitleObserved: null,
  seriesTitleCanonical: null,
  matchedSeriesId: null,
  season: null,
  episode: null,
  resolution: null,
  source: null,
  codec: null,
  language: null,
  evidence: {},
  ambiguities: [],
  recommendedState: "unresolved",
};

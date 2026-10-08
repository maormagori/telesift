import type { ExtractionResult } from "../../modules/extraction/domain/extraction-result-schema.js";

export const CONFIDENT_EPISODE_RESULT: ExtractionResult = {
  isTvEpisode: true,
  seriesTitleObserved: "Fauda",
  season: 4,
  episode: 3,
  language: "he",
  ambiguities: [],
  recommendedState: "index",
};

export const AMBIGUOUS_EPISODE_RESULT: ExtractionResult = {
  isTvEpisode: true,
  seriesTitleObserved: "Some Show",
  season: 1,
  episode: 1,
  language: "en",
  ambiguities: ["caption and filename disagree on episode number"],
  recommendedState: "review",
};

export const NEGATIVE_RESULT: ExtractionResult = {
  isTvEpisode: false,
  seriesTitleObserved: null,
  season: null,
  episode: null,
  language: null,
  ambiguities: [],
  recommendedState: "review",
};
